const { awscdk } = require('projen');

const projectName = 'cdk-extensions';
const cdkVersion = '2.45.0';
const docsBucket = 'docs.vibe.io';

const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Kevin Lucas',
  authorAddress: 'kevinluc08@gmail.com',
  cdkVersion: cdkVersion,
  defaultReleaseBranch: 'master',
  gitignore: [
    '/docs/generated/',
    '/.vscode/',
  ],
  publishToGo: {
    gitBranch: 'master',
    githubUseSsh: true,
    moduleName: 'github.com/vibe-io/cdk-extensions-go',
  },
  publishToNuget: {
    dotNetNamespace: 'CdkExtensions',
    packageId: 'CdkExtensions',
  },
  publishToPypi: {
    distName: 'cdk-extensions',
    module: 'cdk_extensions',
  },
  name: projectName,
  repositoryUrl: 'https://github.com/vibe-io/cdk-extensions.git',


  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
});

const releaseWorkflows = project.github.workflows.filter((x) => {
  return x.name === 'release';
});

if (releaseWorkflows.length === 1) {
  const release = releaseWorkflows[0];
  release.addJob('typedoc', {
    needs: [
      'release',
    ],
    permissions: {
      contents: 'write',
    },
    runsOn: [
      'ubuntu-latest',
    ],
    steps: [
      {
        uses: 'actions/setup-node@v3',
        with: {
          'node-version': '16.x',
        },
      },
      {
        name: 'Checkout',
        uses: 'actions/checkout@v3',
      },
      {
        name: 'Install typescript',
        run: 'npm install typescript',
      },
      {
        name: 'Install dependencies',
        run: 'yarn install --check-files --production=false',
      },
      {
        name: 'Generate typedoc',
        run: 'npx -p typedoc@latest typedoc --tsconfig ./tsconfig.dev.json',
      },
      {
        name: 'Upload to S3',
        env: {
          AWS_ACCESS_KEY_ID: '${{ secrets.AWS_ACCESS_KEY_ID }}',
          AWS_SECRET_ACCESS_KEY: '${{ secrets.AWS_SECRET_ACCESS_KEY }}',
          DOCS_BUCKET: docsBucket,
        },
        run: 'aws s3 sync "s3://${DOCS_BUCKET}/" "./docs/generated"',
      },
    ],
  });
} else if (releaseWorkflows.length > 1) {
  console.log('Multiple release workflows found not sure how to set up doc generation. Skipping...');
}

project.synth();