export class Messages {
	public static acquireTokenFromRefreshTokenFailed: string =
		"Acquiring token with refresh token failed. Error: %s.";

	public static addAzurePipelinesYmlFile: string =
		"Added Azure Pipelines YAML definition.";

	public static addGitHubWorkflowYmlFile: string =
		"Added GitHub Workflow YAML definition.";

	public static fetchingTemplates: string = "Fetching templates";

	public static appKindIsNotSupported: string =
		'App type "%s" is not yet supported.';

	public static azureResourceIsNull: string =
		"ArgumentNullException: resource. The Azure target resource is empty, kindly select a resource and try again.";

	public static azureAccountExntesionUnavailable: string =
		"Azure-Account extension could not be fetched. Please ensure it's installed and activated.";

	public static azureLoginRequired: string =
		"Please sign in to your Azure account first.";

	public static branchRemoteMissing: string = `The current branch doesn't have a tracking branch, and the selected repository has no remotes. We're unable to create a remote tracking branch. Please [set a remote tracking branch](https://git-scm.com/docs/git-branch#Documentation/git-branch.txt---track) first, and then try this again.`;

	public static browsePipeline: string = "Browse Pipeline";

	public static cannotAddFileRemoteMissing: string =
		"Couldn't add YAML file to your repo because the remote isn't set";

	public static cannotIdentifyRespositoryDetails: string =
		"Couldn't get repository details. Ensure your repo is hosted on [Azure Repos](https://docs.microsoft.com/azure/devops/repos/get-started) or [GitHub](https://guides.github.com/activities/hello-world/).";

	public static commitAndPush: string = "Commit & push";

	public static commitFailedErrorMessage: string = `Commit failed due to error: %s`;

	public static configuringPipelineAndDeployment: string =
		"Configuring pipeline and proceeding to deployment...";

	public static couldNotAuthorizeEndpoint: string =
		"Couldn't authorize endpoint for use in Azure Pipelines.";

	public static creatingAzureDevOpsOrganization: string =
		"Creating Azure DevOps organization.";

	public static creatingAzureServiceConnection: string =
		"Creating Azure deployment credentials with your subscription: %s";

	public static creatingKubernetesConnection: string =
		"Creating connection with kubernetes resource: %s";

	public static creatingContainerRegistryConnection: string =
		"Creating connection with container registry resource: %s";

	public static creatingGitHubServiceConnection: string =
		"Creating GitHub service connection";

	public static discardPipeline: string = "Discard pipeline";

	public static enterAzureDevOpsOrganizationName: string =
		"Azure DevOps organization name where your pipeline will be hosted";

	public static enterGitHubPat: string =
		"Enter GitHub personal access token (PAT), required to populate secrets that are used in the Github workflow";

	public static failedToCreateAzureDevOpsProject: string =
		"Couldn't create a project in the Azure DevOps organization. Error: %s.";

	public static failedToCreateAzurePipeline: string =
		"Couldn't configure pipeline. Error: %s";

	public static failedToDetermineAzureRepoDetails: string =
		"Failed to determine Azure Repo details from remote url. Please ensure that the remote points to a valid Azure Repos url.";

	public static githubPatTokenErrorMessage: string =
		"GitHub PAT token cannot be empty.";

	public static githubPatTokenHelpMessage: string =
		"GitHub personal access token (PAT) with following permissions: Update github action workflows, read and write access to all repository data.";

	public static githubPatTokenHelpMessageGithubWorkflow: string =
		"GitHub personal access token (PAT) with following permissions: read and write access to all repository data.";

	public static modifyAndCommitFile: string =
		"Modify and save your YAML file. %s will commit this file, push the branch '%s' to remote '%s' and proceed with deployment.";

	public static modifyAndCommitFileWithGitInitialization: string =
		"Modify and save your YAML file to proceed with deployment.";

	public static noAgentQueueFound: string = 'No agent pool found named "%s".';

	public static notAGitRepository: string =
		"Selected workspace is not a [Git](https://git-scm.com/docs/git) repository. Please select a Git repository.";

	public static notAzureRepoUrl: string =
		"The repo isn't hosted with Azure Repos.";

	public static noWorkSpaceSelectedError: string =
		"Please select a workspace folder to configure pipeline.";

	public static operationCancelled: string = "Operation cancelled.";

	public static operationTimedOut: string = "Operation timed out.";

	public static organizationNameReservedMessage: string =
		"The organization name %s isn't available. Please try another organization name.";

	public static organizationNameStaticValidationMessage: string =
		"Organization names must start and end with a letter or number and can contain only letters, numbers, and hyphens.";

	public static pipelineSetupSuccessfully: string =
		"Pipeline set up successfully!";

	public static remoteRepositoryNotConfigured: string =
		"Remote repository is not configured. This extension is compatible with [Azure Repos](https://docs.microsoft.com/en-us/azure/devops/repos/get-started) or [GitHub](https://guides.github.com/activities/hello-world/).";

	public static resourceIdMissing: string =
		'Required argument "resourceId" is missing. Please pass the argument for getting resource.';

	public static resourceTypeIsNotSupported: string =
		'"%s" resources are not yet supported for configuring pipelines.';

	public static selectFolderLabel: string =
		"Select source folder for configuring pipeline";

	public static selectOrganization: string =
		"Select an Azure DevOps organization";

	public static selectPipelineTemplate: string = "Select a pipeline template";

	public static selectProject: string = "Select an Azure DevOps project";

	public static selectRemoteForBranch: string =
		"Select the remote repository where you want to track your current branch";

	public static selectSubscription: string =
		"Select the target Azure Subscription to deploy to your application";

	public static selectWorkspace: string =
		"Select the working directory to your application";

	public static selectTargetResource: string =
		"Select the target Azure Resource to deploy your application";

	public static selectWorkspaceFolder: string =
		"Select a folder from your workspace to deploy";

	public static signInLabel: string = "Sign In";

	public static signUpLabel: string = "Sign Up";

	public static unableToCreateAzureServiceConnection: string = `Unable to store connection details for Azure subscription.\nOperation Status: %s\nMessage: %s\nService connection is not in ready state.`;

	public static unableToCreateGitHubServiceConnection: string = `Unable to store connection details for GitHub.\nOperation Status: %s\nService connection is not in ready state.`;

	public static retryFailedMessage: string = `Failed after retrying: %s times. Internal Error: %s`;

	public static azureServicePrincipalFailedMessage: string = `Failed while creating Azure service principal.`;

	public static roleAssignmentFailedMessage: string = `Failed while role assignement.`;

	public static waitForAzureSignIn: string = `Waiting for Azure sign-in...`;

	public static userCancelledExcecption = "User cancelled the action";

	public static cannotFindPipelineUrlInMetaDataException =
		'We were unable to find pipeline associated with the Azure Web App. Please click on "Browse Pipeline" to explore.';

	public static cannotFindOrganizationWithName =
		"Unable to find organization with name: %s";

	public static browseNotAvailableConfigurePipeline =
		'No pipeline is configured for this Azure Web App. Please click on "Deploy to Azure" to setup.';

	public static didNotRecieveAzureResourceNodeToProcess =
		"Unable to browse the pipeline for you. Please raise an issue in the [repo](https://github.com/microsoft/vscode-deploy-azure/issues).";

	public static copyAndOpenLabel: string = "Copy & Open";

	public static nextLabel: string = "Next";

	public static githubWorkflowSetupSuccessfully: string =
		"GitHub workflow set up successfully !";

	public static copyAndCreateSecretMessage: string =
		"To deploy to Azure App Service via GitHub workflow, create a new secret with name '%s' in your repository. Copy the below secret value to add the secret";

	public static browseWorkflow: string = "Browse Workflow";

	public static deploymentLogMessage: string = "Configured from VS Code";

	public static setupAlreadyConfigured =
		"Setup is already configured for your web app. Browse to know more about the existing setup.";

	public static settingUpGithubSecrets = "Setting up GitHub Workflow secrets";

	public static parameterOfTypeNotSupported =
		"Parameter of type %s is not supported.";

	public static parameterWithDataSourceOfTypeNotSupported =
		"Parameter with data source Id: %s is not supported.";

	public static assetOfTypeNotSupportedForGitHub =
		"Asset of type %s is not supported for GitHub workflows.";

	public static assetOfTypeNotSupportedForAzurePipelines =
		"Asset of type %s is not supported for Azure Pipelines.";

	public static assetOfTypeNotSupported =
		"Asset of type %s is not supported.";

	public static couldNotFindTargetResourceValueInParams =
		"Could not find corresponding parameter value for template's target resource type: %s.";

	public static assetCreationOfTypeFailedWithError =
		"Creation of asset of type: %s, failed with error: %s";

	public static azureResourceTemplateParameterCouldNotBeFound =
		"Template has no parameter of type %s.";

	public static parameterWithNameNotSet =
		"Parameter with name: %s has not yet been set, hence its value could not be found.";

	public static unableToFetchPasswordOfContainerRegistry =
		"Password for container registry is could not be fetched. It is required for setting up AUTH with registry.";

	public static onlyAdminEnabledRegistriesAreAllowed =
		"The chosen Container registry doesn't have admin user access enabled (allows access to registry with username password). Kindly choose a registry which has admin user access enabled.";

	public static unableToGetSelectedResource =
		"Unable to fetch the selected azure resource: %s";

	public static unableToGetAksKubeConfig =
		"We are unable to fetch kube config for the AKS cluster: %s, due to permission issues. Kindly choose a different one, over which you have access.";

	public static modifyAndCommitMultipleFiles: string =
		"Modify and save your YAML files. %s will commit these files, push the branch '%s' to remote '%s' and proceed with deployment.";

	public static EmptyTagRowUnavailable =
		"There is no space to create a new tag in the resource to store information to ";

	public static valueRequired = "The value cannot be empty";

	public static TemplateNotFound = "Template not found";

	public static ResourceNotSupported = "Resource not supported";

	public static minLengthMessage = "The minimum length allowed is %s";

	public static maxLengthMessage = "The maximum length allowed is %s";

	public static minValueMessage =
		"The value should be greater than or equals to %s";

	public static maxValueMessage =
		"The value should be less than or equals to %s";

	public static valueShouldBeNumber = "The value %s is not numberic";

	public static regexPatternNotMatchingMessage =
		"Value should match the following regex pattern: %s";

	public static fetchingInputMessage = "Fetching %s value(s)";

	public static GettingNodeVersion = "Getting Node version to install";

	public static gettingTemplateFileAsset =
		"Getting template file asset to commit";

	public static gettingWorkflowFile = "Getting workflow file";

	public static templateFileNotFound = "Template file %s not found";

	public static selectGitHubOrganizationName = "Select a GitHub organization";

	public static createGitHubOrganization =
		"Create a GitHub Organization first to create GitHub repository.";

	public static newGitHubRepositoryCreated =
		"New GitHub repository with the name '%s' has been created.";

	public static cannotCreateGitHubRepository =
		"New GitHub repository could not be created as the repository with the same name already exists";

	public static languageNotSupported =
		"The language of the repository selected is not supported.";

	public static UnableToGetTemplateParameters =
		"Unable to get parameters for the selected template.";

	public static AnalyzingRepo = "Analyzing your repository";

	public static AzureLoginError =
		"Error in getting Azure login information. Please open 'Command Palette' and select 'Azure: Sign Out' and then invoke 'Deploy to Azure' extension.";

	public static AdoDifferentTenantError =
		" One potential reason can be the AAD tenant of your Azure DevOps repository is different than the one you have been logged-in to VSCode. Open 'Command Palette' and select 'Azure: Sign Out' and then Sign-In to other tenant by invoking 'Deploy to Azure' extension";

	public static ConfiguringPipelineFailed =
		"Configuring provisioning pipeline failed due to %s";

	public static CreatingSPN = "Creating SPN";

	public static GeneratingWorkflowFiles = "Generating workflow file(s)";

	public static CreatingResourceGroup = "Creating resource group";

	public static ConfiguringGithubWorkflowAndDeployment =
		"Configuring github workflow and proceeding to deployment...";

	public static ConfiguringGitubWorkflowFailed =
		"Configuring github workflow failed due to %s";

	public static NoAzureSubscriptionFound = "No Azure Subscription Found.";

	public static GithubRepoRequired =
		"The selected folder is not a GitHub repository.Please ensure your repository is hosted on GitHub and try again.";

	public static GithubWorkflowSetupMultiFile: string =
		"The workflow files are pushed to your Github repository([commit URL](%s)) and workflow is set up successfully !";

	public static GithubWorkflowSetup: string =
		"The workflow file is pushed to your Github repository([commit URL](%s)) and workflow is set up successfully !";

	public static GitHubPatInvalid: string =
		"The GitHub Personal Access token is Invalid. Please retry the command with a valid Personal Access token and ensure that it has permission for required scopes.";

	public static UndefinedClientCredentials: string =
		"Undefined client credentials";
}
