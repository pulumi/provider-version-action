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

## Releases

### Creating a Release

Releases are created by repository maintainers by pushing a semantic version tag. When you push a version tag (e.g., `v1.7.0`), the automated release workflow will:

1. Create a GitHub release with auto-generated release notes
2. Update the floating major version tag (e.g., `v1` will point to the latest `v1.x.x` release)

This allows users to reference the action as `pulumi/provider-version-action@v1` and automatically receive bug fixes and non-breaking updates.

### Semantic Versioning

This project follows [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR version** (`v2.0.0`): Incompatible API changes
- **MINOR version** (`v1.7.0`): New functionality in a backwards compatible manner
- **PATCH version** (`v1.6.1`): Backwards compatible bug fixes

### Release Checklist

Before creating a release tag, ensure:

1. All changes are merged to the `main` branch
2. Tests pass: `npm test`
3. Build is up-to-date: `npm run build`
4. The `dist/` folder contains the latest compiled code and is committed
5. The [self-test workflow](https://github.com/pulumi/provider-version-action/actions/workflows/self-test.yml) is passing on `main`

### Creating a Release Tag

The easiest way to create a release is using the release script:

```bash
# This will test, build, update package.json, and create the tag
npm run release 1.7.0
```

The script will:
1. Ensure you're on the latest `main` branch
2. Run tests and build
3. Update `package.json` version
4. Commit the version bump
5. Create and push the version tag

Alternatively, you can create a tag manually:

```bash
# Ensure you're on latest main
git checkout main
git pull origin main

# Update package.json version
npm version 1.7.0 --no-git-tag-version
git add package.json
git commit -m "Bump version to 1.7.0"
git push origin main

# Create and push the tag
git tag v1.7.0
git push origin v1.7.0
```

The release workflow will automatically handle the rest.

### Manual Tag Update (Emergency Only)

If the automated workflow fails or you need to manually update a floating tag:

```bash
# Force update the major version tag to a specific release
git tag -f v1 v1.6.0
git push -f origin v1
```

**Note**: Floating tags (e.g., `v1`, `v2`) are moving targets that change with each release. Users who pin to specific versions (e.g., `v1.6.0`) are not affected by floating tag updates.
