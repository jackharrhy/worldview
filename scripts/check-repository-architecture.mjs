import process from 'node:process';

import {
  analyzeRepositoryArchitecture,
  formatArchitectureViolation,
} from './lib/repository-architecture.mjs';

const result = await analyzeRepositoryArchitecture(process.cwd());
if (result.violations.length > 0) {
  console.error('Repository architecture contracts failed:\n');
  for (const violation of result.violations) {
    console.error(`- ${formatArchitectureViolation(violation)}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Repository architecture contracts passed for ${result.sourceFileCount} production modules across ${result.workspaceCount} workspaces.`,
  );
}
