# Contributing to the Pulumi ecosystem

Do you want to contribute to Pulumi? Awesome! We are so happy to have you.
We have a few tips and housekeeping items to help you get up and running.

## Code of Conduct

Please make sure to read and observe our [Code of Conduct](./CODE-OF-CONDUCT.md)

## Community Expectations

Please read about our [contribution guidelines here.](https://github.com/pulumi/pulumi/blob/master/CONTRIBUTING.md#communications)

## Setting up your development environment

1. Install Node.js version 20 or greater.
2. Run `npm install` to restore dependencies.

## Submitting Pull Requests

You must re-generate the `dist/` folder after making any changes.

1. Run `npm test` after any changes to ensure the unit tests pass.
2. Run `npm run build` to re-generate the `dist/` folder. Any changes should be committed.
