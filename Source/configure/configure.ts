import * as path from "path";
import { GenericResource } from "azure-arm-resource/lib/resource/models";
import {
	ApplicationSettings,
	RepositoryAnalysis,
} from "azureintegration-repoanalysis-client-internal";
import * as vscode from "vscode";
import { UserCancelledError } from "vscode-azureextensionui";

import { AppServiceClient } from "./clients/azure/appServiceClient";
import { AzureResourceClient } from "./clients/azure/azureResourceClient";
import { ProvisioningServiceClientFactory } from "./clients/provisioningServiceClientFactory";
import { TemplateServiceClientFactory } from "./clients/TemplateServiceClientFactory";
import { Configurer } from "./configurers/configurerBase";
import { ConfigurerFactory } from "./configurers/configurerFactory";
import { ProvisioningConfigurer } from "./configurers/provisioningConfigurer";
import { RemoteGitHubWorkflowConfigurer } from "./configurers/remoteGitHubWorkflowConfigurer";
import { ResourceSelectorFactory } from "./configurers/ResourceSelectorFactory";
import { AssetHandler } from "./helper/AssetHandler";
import {
	getAzureSession,
	getSubscriptionSession,
} from "./helper/azureSessionHelper";
import { ControlProvider } from "./helper/controlProvider";
import { AzureDevOpsHelper } from "./helper/devOps/azureDevOpsHelper";
import { GitHubProvider } from "./helper/gitHubHelper";
import { LocalGitRepoHelper } from "./helper/LocalGitRepoHelper";
import { RepoAnalysisHelper } from "./helper/repoAnalysisHelper";
import { Result, telemetryHelper } from "./helper/telemetryHelper";
import * as templateHelper from "./helper/templateHelper";
import { TemplateParameterHelper } from "./helper/templateParameterHelper";
import { ConfigurationStage } from "./model/Contracts";
import {
	extensionVariables,
	GitBranchDetails,
	GitRepositoryParameters,
	IResourceNode,
	MustacheContext,
	ParsedAzureResourceId,
	PipelineType,
	QuickPickItemWithData,
	RepositoryProvider,
	SourceOptions,
	StringMap,
	TargetResourceType,
	WizardInputs,
} from "./model/models";
import {
	DraftPipelineConfiguration,
	ProvisioningConfiguration,
	provisioningMode,
} from "./model/provisioningConfiguration";
import {
	LocalPipelineTemplate,
	PipelineTemplate,
	RemotePipelineTemplate,
	TemplateAssetType,
	TemplateType,
} from "./model/templateModels";
import * as constants from "./resources/constants";
import { Messages } from "./resources/messages";
import { TelemetryKeys } from "./resources/telemetryKeys";
import { TracePoints } from "./resources/tracePoints";
import { InputControlProvider } from "./templateInputHelper/InputControlProvider";
import { Utilities, WhiteListedError } from "./utilities/utilities";

const uuid = require("uuid/v4");

const Layer: string = "configure";

export let UniqueResourceNameSuffix: string = uuid().substr(0, 5);

export async function configurePipeline(node: IResourceNode | vscode.Uri) {
	await telemetryHelper.executeFunctionWithTimeTelemetry(async () => {
		try {
			if (
				!(await extensionVariables.azureAccountExtensionApi.waitForLogin())
			) {
				// set telemetry
				telemetryHelper.setTelemetry(
					TelemetryKeys.AzureLoginRequired,
					"true",
				);

				const loginOption = await vscode.window.showInformationMessage(
					Messages.azureLoginRequired,
					Messages.signInLabel,
					Messages.signUpLabel,
				);

				if (
					loginOption &&
					loginOption.toLowerCase() ===
						Messages.signInLabel.toLowerCase()
				) {
					telemetryHelper.setTelemetry(
						TelemetryKeys.AzureLoginOption,
						"SignIn",
					);

					await vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							title: Messages.waitForAzureSignIn,
						},
						async () => {
							await vscode.commands.executeCommand(
								"azure-account.login",
							);

							await extensionVariables.azureAccountExtensionApi.waitForSubscriptions();
						},
					);
				} else if (
					loginOption &&
					loginOption.toLowerCase() ===
						Messages.signUpLabel.toLowerCase()
				) {
					telemetryHelper.setTelemetry(
						TelemetryKeys.AzureLoginOption,
						"SignUp",
					);

					await vscode.commands.executeCommand(
						"azure-account.createAccount",
					);

					return;
				} else {
					const error = new UserCancelledError(
						Messages.azureLoginRequired,
					);

					throw error;
				}
			}

			const orchestrator = new Orchestrator();

			await orchestrator.configure(node);
		} catch (error) {
			if (!(error instanceof UserCancelledError)) {
				vscode.window.showErrorMessage(error.message);

				extensionVariables.outputChannel.appendLine(error.message);

				if (error instanceof WhiteListedError) {
					telemetryHelper.setTelemetry(
						TelemetryKeys.IsErrorWhitelisted,
						"true",
					);

					telemetryHelper.setResult(Result.Succeeded, error);
				} else {
					telemetryHelper.setResult(Result.Failed, error);
				}
			} else {
				telemetryHelper.setResult(Result.Canceled, error);
			}
		}
	}, TelemetryKeys.CommandExecutionDuration);
}

class Orchestrator {
	private inputs: WizardInputs;

	private localGitRepoHelper: LocalGitRepoHelper;

	private azureResourceClient: AzureResourceClient;

	private workspacePath: string;

	private controlProvider: ControlProvider;

	private continueOrchestration: boolean = true;

	private context: StringMap<any> = {};

	private pipelineType: PipelineType;

	public constructor() {
		this.inputs = new WizardInputs();

		this.controlProvider = new ControlProvider();

		UniqueResourceNameSuffix = uuid().substr(0, 5);

		this.context["isResourceAlreadySelected"] = false;

		this.context["resourceId"] = "";
	}

	public async configure(node: IResourceNode | vscode.Uri): Promise<void> {
		telemetryHelper.setCurrentStep("GetAllRequiredInputs");

		await this.getInputs(node);

		if (this.continueOrchestration) {
			if (this.doesLanguageAndTargetSupportRemoteProvisioning()) {
				return await this.configurePipelineRemotely();
			}

			return this.ConfigurePipelineLocally();
		}
	}

	private doesLanguageAndTargetSupportRemoteProvisioning(): boolean {
		// This check is to enable for all remote repository webapps and aks flows to use remote provisioning service.
		// Both template type as remote and remote url check is required because remote provisioning is only applicable for remote templates and there are scenario where template selected is remote but repo is not remote (in cases where resource is already selected)
		return (
			extensionVariables.remoteConfigurerEnabled === true &&
			this.inputs.sourceRepository.repositoryProvider ===
				RepositoryProvider.Github &&
			(this.inputs.targetResource.resource.type ===
				TargetResourceType.AKS ||
				this.inputs.targetResource.resource.type ===
					TargetResourceType.WebApp) &&
			!!this.inputs.sourceRepository.remoteUrl &&
			this.inputs.pipelineConfiguration.template.templateType ===
				TemplateType.REMOTE
		);
	}

	private async getAzureResource(targetType: TargetResourceType) {
		const azureResourceSelector =
			ResourceSelectorFactory.getAzureResourceSelector(targetType);

		this.inputs.targetResource.resource =
			await azureResourceSelector.getAzureResource(this.inputs);

		this.azureResourceClient =
			ResourceSelectorFactory.getAzureResourceClient(
				targetType,
				this.inputs.azureSession.credentials,
				this.inputs.azureSession.environment,
				this.inputs.azureSession.tenantId,
				this.inputs.subscriptionId,
			);

		telemetryHelper.setTelemetry(
			TelemetryKeys.resourceType,
			this.inputs.targetResource.resource.type,
		);

		if (targetType === TargetResourceType.WebApp) {
			this.context["resourceId"] = this.inputs.targetResource.resource.id;

			telemetryHelper.setTelemetry(
				TelemetryKeys.resourceKind,
				this.inputs.targetResource.resource.kind,
			);

			telemetryHelper.setTelemetry(
				TelemetryKeys.resourceIdHash,
				Utilities.createSha256Hash(
					this.inputs.targetResource.resource.id,
				),
			);
		}
	}

	private async selectTemplate(resource: GenericResource): Promise<void> {
		switch (resource.type) {
			case TargetResourceType.AKS:
				if (
					extensionVariables.remoteConfigurerEnabled === true &&
					this.inputs.sourceRepository.repositoryProvider ===
						RepositoryProvider.Github &&
					!!this.inputs.sourceRepository.remoteUrl
				) {
					this.inputs.pipelineConfiguration.template =
						this.inputs.potentialTemplates.find(
							(template) =>
								template.templateType === TemplateType.REMOTE,
						);
				} else {
					this.inputs.pipelineConfiguration.template =
						this.inputs.potentialTemplates.find(
							(template) =>
								template.templateType === TemplateType.LOCAL,
						);
				}

				if (this.inputs.pipelineConfiguration.template === undefined) {
					telemetryHelper.logError(
						Layer,
						TracePoints.TemplateNotFound,
						new Error(
							Messages.TemplateNotFound +
								" RepoId: " +
								this.inputs.sourceRepository.repositoryId,
						),
					);

					throw new Error(Messages.TemplateNotFound);
				}

				break;

			case TargetResourceType.WebApp:
				let shortlistedTemplates = [];

				shortlistedTemplates = this.inputs.potentialTemplates.filter(
					(template) => template.targetKind === resource.kind,
				);

				if (!!shortlistedTemplates && shortlistedTemplates.length > 1) {
					this.inputs.pipelineConfiguration.template =
						shortlistedTemplates.find(
							(template) =>
								template.templateType === TemplateType.REMOTE,
						);
				} else if (!!shortlistedTemplates) {
					this.inputs.pipelineConfiguration.template =
						shortlistedTemplates[0];
				} else {
					telemetryHelper.logError(
						Layer,
						TracePoints.TemplateNotFound,
						new Error(
							Messages.TemplateNotFound +
								" RepoId: " +
								this.inputs.sourceRepository.repositoryId,
						),
					);

					throw new Error(Messages.TemplateNotFound);
				}

				break;

			default:
				throw new Error(Messages.ResourceNotSupported);
		}
	}

	private setPipelineType() {
		if (
			this.inputs.sourceRepository.repositoryProvider ===
				RepositoryProvider.Github &&
			extensionVariables.enableGitHubWorkflow
		) {
			this.pipelineType = PipelineType.GitHubPipeline;
		} else {
			this.pipelineType = PipelineType.AzurePipeline;
		}
	}

	private isResourceAlreadySelected(): boolean {
		return this.context["isResourceAlreadySelected"];
	}

	private async getInputs(node: IResourceNode | vscode.Uri): Promise<void> {
		telemetryHelper.setTelemetry(
			TelemetryKeys.FF_UseGithubForCreatingNewRepository,
			vscode.workspace
				.getConfiguration()
				.get("deployToAzure.UseGithubForCreatingNewRepository"),
		);

		telemetryHelper.setTelemetry(
			TelemetryKeys.FF_UseAzurePipelinesForGithub,
			vscode.workspace
				.getConfiguration()
				.get("deployToAzure.UseAzurePipelinesForGithub"),
		);

		await this.analyzeNode(node);

		if (this.continueOrchestration) {
			await this.getSourceRepositoryDetails();

			if (!this.inputs.azureSession) {
				this.inputs.azureSession = await getAzureSession();
			}

			// Right click scenario not supported for Azure and local repo
			if (this.isResourceAlreadySelected()) {
				if (
					this.inputs.sourceRepository.repositoryProvider ===
						RepositoryProvider.AzureRepos ||
					extensionVariables.isLocalRepo
				) {
					throw new WhiteListedError(Messages.GithubRepoRequired);
				} else if (!extensionVariables.enableGitHubWorkflow) {
					// For github repo, we create a github pipeline
					extensionVariables.enableGitHubWorkflow = true;
				}
			}

			const repoAnalysisResult = await this.getRepositoryAnalysis();

			this.initializeClientFactories();

			this.setPipelineType();

			await this.getTemplatesByRepoAnalysis(repoAnalysisResult);

			try {
				if (!this.isResourceAlreadySelected()) {
					await this.getAzureSubscription();

					await this.getAzureResource(
						this.getSelectedPipelineTargetType(),
					);
				}

				this.selectTemplate(this.inputs.targetResource.resource);

				telemetryHelper.setTelemetry(
					TelemetryKeys.SelectedTemplate,
					this.inputs.pipelineConfiguration.template.label,
				);

				telemetryHelper.setTelemetry(
					TelemetryKeys.SelectedTemplateType,
					this.inputs.pipelineConfiguration.template.templateType.toString(),
				);

				await this.updateRepositoryAnalysisApplicationSettings(
					repoAnalysisResult,
				);

				await this.getTemplateParameters();
			} catch (err) {
				if (err.message === Messages.setupAlreadyConfigured) {
					this.continueOrchestration = false;

					return;
				} else {
					throw err;
				}
			}
		}
	}

	private async getTemplateParameters() {
		if (
			this.inputs.pipelineConfiguration.template.templateType ===
			TemplateType.REMOTE
		) {
			const template = this.inputs.pipelineConfiguration
				.template as RemotePipelineTemplate;

			const extendedPipelineTemplate =
				await templateHelper.getTemplateParameters(template.id);

			template.attributes = extendedPipelineTemplate.attributes;

			template.parameters = extendedPipelineTemplate.parameters;

			const controlProvider = new InputControlProvider(
				this.inputs.azureSession,
				extendedPipelineTemplate,
				this.context,
			);

			this.inputs.pipelineConfiguration.params =
				await controlProvider.getAllPipelineTemplateInputs();
		} else if (
			this.inputs.pipelineConfiguration.template.targetType ===
				TargetResourceType.AKS &&
			this.inputs.sourceRepository.repositoryId !=
				RepositoryProvider.Github
		) {
			const templateParameterHelper = await new TemplateParameterHelper();

			const template = this.inputs.pipelineConfiguration
				.template as LocalPipelineTemplate;

			await templateParameterHelper.setParameters(
				template.parameters,
				this.inputs,
			);
		}
	}

	private async getGithubPatToken(): Promise<void> {
		if (
			this.inputs.sourceRepository.repositoryProvider ===
			RepositoryProvider.Github
		) {
			this.inputs.githubPATToken =
				await this.controlProvider.showInputBox(constants.GitHubPat, {
					placeHolder: Messages.enterGitHubPat,
					prompt: Messages.githubPatTokenHelpMessage,
					validateInput: (inputValue) => {
						return !inputValue
							? Messages.githubPatTokenErrorMessage
							: null;
					},
				});
		}
	}

	private async getRepositoryAnalysis() {
		if (
			this.inputs.sourceRepository.repositoryProvider ===
			RepositoryProvider.Github
		) {
			await this.getGithubPatToken();

			return await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: Messages.AnalyzingRepo,
				},
				() =>
					telemetryHelper.executeFunctionWithTimeTelemetry(
						async () => {
							return await new RepoAnalysisHelper(
								this.inputs.azureSession,
								this.inputs.githubPATToken,
							).getRepositoryAnalysis(
								this.inputs.sourceRepository,
								this.inputs.pipelineConfiguration.workingDirectory
									.split("/")
									.join("\\"),
							);
						},
						TelemetryKeys.RepositoryAnalysisDuration,
					),
			);
		}

		return null;
	}

	private getSelectedPipelineTargetType(): TargetResourceType {
		return this.inputs.potentialTemplates[0].targetType;
	}

	private async analyzeNode(node: IResourceNode | vscode.Uri): Promise<void> {
		if (!!node) {
			const folderNode = node as vscode.Uri;

			if (!!folderNode.fsPath) {
				// right click on a folder
				this.workspacePath = folderNode.fsPath;

				telemetryHelper.setTelemetry(
					TelemetryKeys.SourceRepoLocation,
					SourceOptions.CurrentWorkspace,
				);
			} else if (
				await this.extractAzureResourceFromNode(node as IResourceNode)
			) {
				// right click on a resource
				this.context["isResourceAlreadySelected"] = true;

				this.context["resourceId"] =
					this.inputs.targetResource.resource.id;
			}
		}
	}

	private async getSourceRepositoryDetails(): Promise<void> {
		try {
			if (!this.workspacePath) {
				// This is to handle when we have already identified the repository details.
				await this.setWorkspace();
			}

			await this.getGitDetailsFromRepository();
		} catch (error) {
			telemetryHelper.logError(
				Layer,
				TracePoints.GetSourceRepositoryDetailsFailed,
				error,
			);

			throw error;
		}
	}

	private async setWorkspace(): Promise<void> {
		const workspaceFolders =
			vscode.workspace && vscode.workspace.workspaceFolders;

		if (workspaceFolders && workspaceFolders.length > 0) {
			telemetryHelper.setTelemetry(
				TelemetryKeys.SourceRepoLocation,
				SourceOptions.CurrentWorkspace,
			);

			if (workspaceFolders.length === 1) {
				telemetryHelper.setTelemetry(
					TelemetryKeys.MultipleWorkspaceFolders,
					"false",
				);

				this.workspacePath = workspaceFolders[0].uri.fsPath;
			} else {
				telemetryHelper.setTelemetry(
					TelemetryKeys.MultipleWorkspaceFolders,
					"true",
				);

				const workspaceFolderOptions: QuickPickItemWithData[] = [];

				for (const folder of workspaceFolders) {
					workspaceFolderOptions.push({
						label: folder.name,
						data: folder,
					});
				}

				const selectedWorkspaceFolder =
					await this.controlProvider.showQuickPick(
						constants.SelectFromMultipleWorkSpace,
						workspaceFolderOptions,
						{ placeHolder: Messages.selectWorkspaceFolder },
					);

				this.workspacePath = selectedWorkspaceFolder.data.uri.fsPath;
			}
		} else {
			telemetryHelper.setTelemetry(
				TelemetryKeys.SourceRepoLocation,
				SourceOptions.BrowseLocalMachine,
			);

			const selectedFolder: vscode.Uri[] =
				await vscode.window.showOpenDialog({
					openLabel: Messages.selectFolderLabel,
					canSelectFiles: false,
					canSelectFolders: true,
					canSelectMany: false,
				});

			if (selectedFolder && selectedFolder.length > 0) {
				this.workspacePath = selectedFolder[0].fsPath;
			} else {
				throw new UserCancelledError(Messages.noWorkSpaceSelectedError);
			}
		}
	}

	private async getGitDetailsFromRepository(): Promise<void> {
		this.localGitRepoHelper = LocalGitRepoHelper.GetHelperInstance(
			this.workspacePath,
		);

		const isGitRepository = await this.localGitRepoHelper.isGitRepository();

		if (isGitRepository) {
			const gitBranchDetails =
				await this.localGitRepoHelper.getGitBranchDetails();

			if (!gitBranchDetails.remoteName) {
				// Remote tracking branch is not set
				const remotes = await this.localGitRepoHelper.getGitRemotes();

				if (remotes.length === 0) {
					this.setDefaultRepositoryDetails();
				} else if (remotes.length === 1) {
					gitBranchDetails.remoteName = remotes[0].name;
				} else {
					// Show an option to user to select remote to be configured
					const selectedRemote =
						await this.controlProvider.showQuickPick(
							constants.SelectRemoteForRepo,
							remotes.map((remote) => ({ label: remote.name })),
							{ placeHolder: Messages.selectRemoteForBranch },
						);

					gitBranchDetails.remoteName = selectedRemote.label;
				}
			}

			// Set working directory relative to repository root
			const gitRootDir =
				await this.localGitRepoHelper.getGitRootDirectory();

			this.inputs.pipelineConfiguration.workingDirectory = path
				.relative(gitRootDir, this.workspacePath)
				.split(path.sep)
				.join("/");

			if (this.inputs.pipelineConfiguration.workingDirectory === "") {
				this.inputs.pipelineConfiguration.workingDirectory = ".";
			}

			this.inputs.sourceRepository = this.inputs.sourceRepository
				? this.inputs.sourceRepository
				: await this.getGitRepositoryParameters(gitBranchDetails);
		} else {
			this.setDefaultRepositoryDetails();
		}
		// set telemetry
		telemetryHelper.setTelemetry(
			TelemetryKeys.RepoProvider,
			this.inputs.sourceRepository.repositoryProvider,
		);

		telemetryHelper.setTelemetry(
			TelemetryKeys.RepoId,
			this.inputs.sourceRepository.repositoryId,
		);
	}

	private setDefaultRepositoryDetails(): void {
		extensionVariables.isLocalRepo = true;

		this.inputs.pipelineConfiguration.workingDirectory = ".";

		this.inputs.sourceRepository = {
			branch: "master",
			commitId: "",
			localPath: this.workspacePath,
			remoteName: "origin",
			remoteUrl: "",
			repositoryId: "",
			repositoryName: "",
			repositoryProvider: vscode.workspace
				.getConfiguration()
				.get("deployToAzure.UseGithubForCreatingNewRepository")
				? RepositoryProvider.Github
				: RepositoryProvider.AzureRepos,
		};
	}

	private async getGitRepositoryParameters(
		gitRepositoryDetails: GitBranchDetails,
	): Promise<GitRepositoryParameters> {
		const remoteUrl = await this.localGitRepoHelper.getGitRemoteUrl(
			gitRepositoryDetails.remoteName,
		);

		if (remoteUrl) {
			if (AzureDevOpsHelper.isAzureReposUrl(remoteUrl)) {
				return <GitRepositoryParameters>{
					repositoryProvider: RepositoryProvider.AzureRepos,
					repositoryId: "",
					repositoryName:
						AzureDevOpsHelper.getRepositoryDetailsFromRemoteUrl(
							remoteUrl,
						).repositoryName,
					remoteName: gitRepositoryDetails.remoteName,
					remoteUrl,
					branch: gitRepositoryDetails.branch,
					commitId: "",
					localPath: this.workspacePath,
				};
			} else if (GitHubProvider.isGitHubUrl(remoteUrl)) {
				const repoId = GitHubProvider.getRepositoryIdFromUrl(remoteUrl);

				return <GitRepositoryParameters>{
					repositoryProvider: RepositoryProvider.Github,
					repositoryId: repoId,
					repositoryName: repoId,
					remoteName: gitRepositoryDetails.remoteName,
					remoteUrl,
					branch: gitRepositoryDetails.branch,
					commitId: "",
					localPath: this.workspacePath,
				};
			} else {
				let repositoryProvider: string;

				if (remoteUrl.indexOf("bitbucket.org") >= 0) {
					repositoryProvider = "Bitbucket";
				} else if (remoteUrl.indexOf("gitlab.com") >= 0) {
					repositoryProvider = "GitLab";
				} else {
					repositoryProvider = remoteUrl;
				}

				telemetryHelper.setTelemetry(
					TelemetryKeys.RepoProvider,
					repositoryProvider,
				);

				throw new WhiteListedError(
					Messages.cannotIdentifyRespositoryDetails,
				);
			}
		} else {
			throw new Error(Messages.remoteRepositoryNotConfigured);
		}
	}

	private async extractAzureResourceFromNode(
		node: IResourceNode,
	): Promise<boolean> {
		if (!!node.resource.id && node.resource.type != "cluster") {
			this.inputs.subscriptionId = node.subscriptionId;

			this.inputs.azureSession = await getSubscriptionSession(
				this.inputs.subscriptionId,
			);

			this.azureResourceClient = new AppServiceClient(
				this.inputs.azureSession.credentials,
				this.inputs.azureSession.environment,
				this.inputs.azureSession.tenantId,
				this.inputs.subscriptionId,
			);

			try {
				const azureResource: GenericResource = await (
					this.azureResourceClient as AppServiceClient
				).getAppServiceResource(node.resource.id);

				telemetryHelper.setTelemetry(
					TelemetryKeys.resourceType,
					azureResource.type,
				);

				telemetryHelper.setTelemetry(
					TelemetryKeys.resourceKind,
					azureResource.kind,
				);

				AzureResourceClient.validateTargetResourceType(azureResource);

				if (
					azureResource.type.toLowerCase() ===
					TargetResourceType.WebApp.toLowerCase()
				) {
					if (
						await (
							this.azureResourceClient as AppServiceClient
						).isScmTypeSet(node.resource.id)
					) {
						this.continueOrchestration = false;

						await openBrowseExperience(node.resource.id);
					}
				}

				this.inputs.targetResource.resource = azureResource;

				return true;
			} catch (error) {
				telemetryHelper.logError(
					Layer,
					TracePoints.ExtractAzureResourceFromNodeFailed,
					error,
				);

				throw error;
			}
		} else if (!!node.resource.id && node.resource.type === "cluster") {
			this.inputs.subscriptionId = node.subscriptionId;

			this.context["subscriptionId"] = this.inputs.subscriptionId;

			this.inputs.azureSession = await getSubscriptionSession(
				this.inputs.subscriptionId,
			);

			this.azureResourceClient = new AzureResourceClient(
				this.inputs.azureSession.credentials,
				this.inputs.subscriptionId,
			);

			const cluster = await this.azureResourceClient.getResource(
				node.resource.id,
				"2019-08-01",
			);

			telemetryHelper.setTelemetry(
				TelemetryKeys.resourceType,
				cluster.type,
			);

			AzureResourceClient.validateTargetResourceType(cluster);

			cluster["parsedResourceId"] = new ParsedAzureResourceId(cluster.id);

			this.inputs.targetResource.resource = cluster;

			return true;
		}

		return false;
	}

	private async getAzureSubscription(): Promise<void> {
		// show available subscriptions and get the chosen one
		const subscriptionList =
			extensionVariables.azureAccountExtensionApi.filters.map(
				(subscriptionObject) => {
					return <QuickPickItemWithData>{
						label: `${<string>subscriptionObject.subscription.displayName}`,
						data: subscriptionObject,
						description: `${<string>subscriptionObject.subscription.subscriptionId}`,
					};
				},
			);

		const selectedSubscription: QuickPickItemWithData =
			await this.controlProvider.showQuickPick(
				constants.SelectSubscription,
				subscriptionList,
				{ placeHolder: Messages.selectSubscription },
				TelemetryKeys.SubscriptionListCount,
			);

		this.inputs.subscriptionId =
			selectedSubscription.data.subscription.subscriptionId;

		this.context["subscriptionId"] = this.inputs.subscriptionId;

		this.inputs.azureSession = await getSubscriptionSession(
			this.inputs.subscriptionId,
		);

		telemetryHelper.setTelemetry(
			TelemetryKeys.SubscriptionId,
			this.inputs.subscriptionId,
		);
	}

	private async getTemplatesByRepoAnalysis(
		repoAnalysisResult: RepositoryAnalysis,
	): Promise<void> {
		let appropriatePipelines: PipelineTemplate[] = [];

		const remotePipelines: PipelineTemplate[] =
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: Messages.fetchingTemplates,
				},
				() =>
					templateHelper.analyzeRepoAndListAppropriatePipeline2(
						this.inputs.azureSession,
						this.inputs.sourceRepository,
						this.pipelineType,
						repoAnalysisResult,
						this.inputs.githubPATToken,
						this.inputs.targetResource.resource,
					),
			);

		appropriatePipelines = remotePipelines;

		const pipelineMap = this.getMapOfUniqueLabels(appropriatePipelines);

		const pipelineLabels = Array.from(pipelineMap.keys());

		if (pipelineLabels.length === 0) {
			telemetryHelper.setTelemetry(
				TelemetryKeys.UnsupportedLanguage,
				Messages.languageNotSupported,
			);

			throw new Error(Messages.languageNotSupported);
		}

		if (pipelineLabels.length > 1) {
			const selectedOption = await this.controlProvider.showQuickPick(
				constants.SelectPipelineTemplate,
				pipelineLabels.map((pipeline) => ({ label: pipeline })),
				{ placeHolder: Messages.selectPipelineTemplate },
				TelemetryKeys.PipelineTempateListCount,
			);
			// only label gets finalized, template isn't final yet
			this.inputs.potentialTemplates = pipelineMap.get(
				selectedOption.label,
			);
		} else {
			this.inputs.potentialTemplates = pipelineMap.get(pipelineLabels[0]);
		}
	}

	private getMapOfUniqueLabels(
		pipelines: PipelineTemplate[],
	): Map<string, PipelineTemplate[]> {
		const pipelineMap: Map<string, PipelineTemplate[]> = new Map();

		if (!!pipelines) {
			pipelines.forEach((element) => {
				if (pipelineMap.has(element.label)) {
					pipelineMap.get(element.label).push(element);
				} else {
					pipelineMap.set(element.label, [element]);
				}
			});
		}

		return pipelineMap;
	}

	private async updateRepositoryAnalysisApplicationSettings(
		repoAnalysisResult: RepositoryAnalysis,
	): Promise<void> {
		// If RepoAnalysis is disabled or didn't provided response related to language of selected template
		this.inputs.repositoryAnalysisApplicationSettings =
			{} as ApplicationSettings;

		if (
			!repoAnalysisResult ||
			!repoAnalysisResult.applicationSettingsList
		) {
			return;
		}

		let applicationSettings: ApplicationSettings[] =
			repoAnalysisResult.applicationSettingsList;

		if (!this.isResourceAlreadySelected()) {
			const workingDirectories = Array.from(
				new Set(
					this.inputs.potentialTemplates
						.filter(
							(template) =>
								template.templateType === TemplateType.REMOTE,
						)
						.map((template: RemotePipelineTemplate) =>
							template.workingDirectory.toLowerCase(),
						),
				),
			);

			applicationSettings =
				repoAnalysisResult.applicationSettingsList.filter(
					(applicationSetting) => {
						if (
							this.inputs.pipelineConfiguration.template
								.templateType === TemplateType.REMOTE
						) {
							return (
								workingDirectories.indexOf(
									applicationSetting.settings.workingDirectory.toLowerCase(),
								) >= 0
							);
						}

						return (
							applicationSetting.language ===
							this.inputs.pipelineConfiguration.template.language
						);
					},
				);
		}

		this.context["repoAnalysisSettings"] = applicationSettings;

		if (
			!applicationSettings ||
			applicationSettings.length === 0 ||
			this.inputs.pipelineConfiguration.template.templateType ===
				TemplateType.REMOTE
		) {
			return;
		}

		if (applicationSettings.length === 1) {
			this.inputs.repositoryAnalysisApplicationSettings =
				applicationSettings[0];

			this.inputs.pipelineConfiguration.workingDirectory =
				applicationSettings[0].settings.workingDirectory;

			return;
		}

		const workspacePaths = Array.from(
			new Set(
				applicationSettings.map((a) => a.settings.workingDirectory),
			),
		);

		const workspacePathQuickPickItemList: QuickPickItemWithData[] = [];

		for (const workspacePath of workspacePaths) {
			workspacePathQuickPickItemList.push({
				label: workspacePath,
				data: workspacePath,
			});
		}

		const selectedWorkspacePathItem =
			await this.controlProvider.showQuickPick(
				constants.SelectWorkspace,
				workspacePathQuickPickItemList,
				{ placeHolder: Messages.selectWorkspace },
			);

		this.inputs.pipelineConfiguration.workingDirectory =
			selectedWorkspacePathItem.data;

		this.inputs.repositoryAnalysisApplicationSettings =
			repoAnalysisResult.applicationSettingsList.find(
				(applicationSettings) => {
					return (
						applicationSettings.language ===
							this.inputs.pipelineConfiguration.template
								.language &&
						applicationSettings.settings.workingDirectory ===
							selectedWorkspacePathItem.data
					);
				},
			);
	}

	private async checkInPipelineFileToRepository(
		pipelineConfigurer: Configurer,
	): Promise<void> {
		let filesToCommit: string[] = [];

		if (
			this.inputs.pipelineConfiguration.template.templateType ===
			TemplateType.REMOTE
		) {
			filesToCommit = await (
				pipelineConfigurer as RemoteGitHubWorkflowConfigurer
			).getPipelineFilesToCommit(this.inputs);
		} else {
			try {
				const mustacheContext = new MustacheContext(this.inputs);

				if (
					this.inputs.pipelineConfiguration.template.targetType ===
					TargetResourceType.AKS
				) {
					try {
						await this.localGitRepoHelper.createAndDisplayManifestFile(
							constants.deploymentManifest,
							pipelineConfigurer,
							filesToCommit,
							this.inputs,
						);

						const properties =
							this.inputs.pipelineConfiguration.params.aksCluster
								.properties;

						if (
							properties.addonProfiles &&
							properties.addonProfiles.httpApplicationRouting &&
							properties.addonProfiles.httpApplicationRouting
								.enabled
						) {
							await this.localGitRepoHelper.createAndDisplayManifestFile(
								constants.serviceIngressManifest,
								pipelineConfigurer,
								filesToCommit,
								this.inputs,
								constants.serviceManifest,
							);

							await this.localGitRepoHelper.createAndDisplayManifestFile(
								constants.ingressManifest,
								pipelineConfigurer,
								filesToCommit,
								this.inputs,
							);
						} else {
							await this.localGitRepoHelper.createAndDisplayManifestFile(
								constants.serviceManifest,
								pipelineConfigurer,
								filesToCommit,
								this.inputs,
							);
						}
					} catch (error) {
						telemetryHelper.logError(
							Layer,
							TracePoints.CreatingManifestsFailed,
							error,
						);

						throw error;
					}
				}

				this.inputs.pipelineConfiguration.filePath =
					await pipelineConfigurer.getPathToPipelineFile(
						this.inputs,
						this.localGitRepoHelper,
					);

				filesToCommit.push(this.inputs.pipelineConfiguration.filePath);

				await this.localGitRepoHelper.addContentToFile(
					await templateHelper.renderContent(
						(
							this.inputs.pipelineConfiguration
								.template as LocalPipelineTemplate
						).path,
						mustacheContext,
					),
					this.inputs.pipelineConfiguration.filePath,
				);

				await vscode.window.showTextDocument(
					vscode.Uri.file(this.inputs.pipelineConfiguration.filePath),
				);

				telemetryHelper.setTelemetry(
					TelemetryKeys.DisplayWorkflow,
					"true",
				);
			} catch (error) {
				telemetryHelper.logError(
					Layer,
					TracePoints.AddingContentToPipelineFileFailed,
					error,
				);

				throw error;
			}
		}

		try {
			await pipelineConfigurer.checkInPipelineFilesToRepository(
				filesToCommit,
				this.inputs,
				this.localGitRepoHelper,
			);
		} catch (error) {
			telemetryHelper.logError(
				Layer,
				TracePoints.PipelineFileCheckInFailed,
				error,
			);

			throw error;
		}
	}

	private createProvisioningConfigurationObject(
		templateId: string,
		branch: string,
		pipeplineTemplateParameters: { [key: string]: string },
		mode: provisioningMode,
	): ProvisioningConfiguration {
		return {
			id: null,
			branch,
			pipelineTemplateId: templateId,
			pipelineTemplateParameters: pipeplineTemplateParameters,
			provisioningMode: mode,
		} as ProvisioningConfiguration;
	}

	private async configurePipelineRemotely(): Promise<void> {
		const provisioningConfigurer = new ProvisioningConfigurer(
			this.localGitRepoHelper,
		);

		const template = this.inputs.pipelineConfiguration
			.template as RemotePipelineTemplate;

		try {
			// prerequisite params
			telemetryHelper.setCurrentStep("ConfiguringPreRequisiteParams");

			await provisioningConfigurer.createPreRequisiteParams(this.inputs);

			// Draft pipeline step
			telemetryHelper.setCurrentStep(
				"ConfiguringDraftProvisioningPipeline",
			);

			const provisioningConfiguration =
				this.createProvisioningConfigurationObject(
					template.id,
					this.inputs.sourceRepository.branch,
					this.inputs.pipelineConfiguration.params,
					provisioningMode.draft,
				);

			const draftProvisioningPipeline: ProvisioningConfiguration =
				await provisioningConfigurer.preSteps(
					provisioningConfiguration,
					this.inputs,
				);

			// After recieving the draft workflow files, show them to user and confirm to checkin
			telemetryHelper.setCurrentStep(
				"ConfiguringCompleteProvisioningPipeline",
			);

			provisioningConfiguration.provisioningMode =
				provisioningMode.complete;

			await provisioningConfigurer.postSteps(
				provisioningConfiguration,
				draftProvisioningPipeline.result
					.pipelineConfiguration as DraftPipelineConfiguration,
				this.inputs,
			);

			// All done, now browse the pipeline
			telemetryHelper.setCurrentStep("BrowsingPipeline");

			await provisioningConfigurer.browseQueuedWorkflow();
		} catch (error) {
			telemetryHelper.logError(
				Layer,
				TracePoints.RemotePipelineConfiguringFailed,
				error,
			);

			throw error;
		}
	}

	private async ConfigurePipelineLocally() {
		const pipelineConfigurer = ConfigurerFactory.GetConfigurer(
			this.inputs.sourceRepository,
			this.inputs.azureSession,
			this.inputs.pipelineConfiguration.template.templateType,
			this.localGitRepoHelper,
		);

		const selectedCICDProvider =
			pipelineConfigurer.constructor.name === "AzurePipelineConfigurer"
				? constants.azurePipeline
				: constants.githubWorkflow;

		telemetryHelper.setTelemetry(
			TelemetryKeys.SelectedCICDProvider,
			selectedCICDProvider,
		);

		await pipelineConfigurer.getInputs(this.inputs);

		telemetryHelper.setCurrentStep("CreatePreRequisites");

		await pipelineConfigurer.createPreRequisites(
			this.inputs,
			!!this.azureResourceClient
				? this.azureResourceClient
				: new AppServiceClient(
						this.inputs.azureSession.credentials,
						this.inputs.azureSession.environment,
						this.inputs.azureSession.tenantId,
						this.inputs.subscriptionId,
					),
		);

		telemetryHelper.setCurrentStep("CreateAssets");

		if (
			this.inputs.pipelineConfiguration.template.templateType ===
				TemplateType.REMOTE &&
			this.inputs.sourceRepository.repositoryProvider ===
				RepositoryProvider.Github &&
			extensionVariables.enableGitHubWorkflow
		) {
			await (
				pipelineConfigurer as RemoteGitHubWorkflowConfigurer
			).createAssets(ConfigurationStage.Pre);
		} else {
			await new AssetHandler().createAssets(
				(
					this.inputs.pipelineConfiguration
						.template as LocalPipelineTemplate
				).assets,
				this.inputs,
				(
					name: string,
					assetType: TemplateAssetType,
					data: any,
					inputs: WizardInputs,
				) =>
					pipelineConfigurer.createAsset(
						name,
						assetType,
						data,
						inputs,
					),
			);
		}

		telemetryHelper.setCurrentStep("CheckInPipeline");

		await this.checkInPipelineFileToRepository(pipelineConfigurer);

		telemetryHelper.setCurrentStep("CreateAndRunPipeline");

		await pipelineConfigurer.createAndQueuePipeline(this.inputs);

		telemetryHelper.setCurrentStep("PostPipelineCreation");
		// This step should be determined by the resoruce target provider (azure app service, function app, aks) type and pipelineProvider(azure pipeline vs github)
		pipelineConfigurer.executePostPipelineCreationSteps(
			this.inputs,
			this.azureResourceClient
				? this.azureResourceClient
				: new AzureResourceClient(
						this.inputs.azureSession.credentials,
						this.inputs.subscriptionId,
					),
		);

		telemetryHelper.setCurrentStep("DisplayCreatedPipeline");

		pipelineConfigurer.browseQueuedPipeline();
	}

	private initializeClientFactories(): void {
		TemplateServiceClientFactory.initialize(
			this.inputs.azureSession.credentials,
			this.inputs.githubPATToken,
		);

		ProvisioningServiceClientFactory.initialize(
			this.inputs.azureSession.credentials,
			this.inputs.githubPATToken,
		);
	}
}

export async function openBrowseExperience(resourceId: string): Promise<void> {
	try {
		// if pipeline is already setup, the ask the user if we should continue.
		telemetryHelper.setTelemetry(
			TelemetryKeys.PipelineAlreadyConfigured,
			"true",
		);

		const browsePipelineAction =
			await new ControlProvider().showInformationBox(
				constants.SetupAlreadyExists,
				Messages.setupAlreadyConfigured,
				constants.Browse,
			);

		if (browsePipelineAction === constants.Browse) {
			vscode.commands.executeCommand("browse-cicd-pipeline", {
				fullId: resourceId,
			});
		}
	} catch (err) {
		if (!(err instanceof UserCancelledError)) {
			throw err;
		}
	}

	telemetryHelper.setResult(Result.Succeeded);
}
