# Provider Version Action

This action calculates the version to be used during a Pulumi provider build.

The calculated version is always valid [semver 2.0.0](https://semver.org/) – with no leading "v".

## Usage

```yaml
- uses: pulumi/provider-version-action@v1
  with:
    # Optional name of the environment variable to set with the calculated version, for example: PROVIDER_VERSION
    # Defaults to empty which results in no environment variable being set.
    set-env: ''
```

### Outputs

| Name | Description | Example |
| - | - | - |
| `version` | The calculated version for the current build | `1.3.0-alpha.1577836800+699a10d` |

## Examples

### Environment Variable

Set the `PROVIDER_VERSION` environment variable for use in any subsequent steps within the current job:

```yaml
steps:
- uses: pulumi/provider-version-action@v1
  with:
    set-env: PROVIDER_VERSION
- name: Print version
  run: echo "${PROVIDER_VERSION}"
```

### Step Output

Access the calculated version via the step's output:

```yaml
steps:
- id: version
  uses: pulumi/provider-version-action@v1
- name: Print version
  run: echo "${{ steps.version.outputs.version }}"
```

### Standalone Job

Calculate the version once in a standalone job for all other jobs to reference:

```yaml
jobs:
  version:
    runs-on: ubuntu-latest
    steps:
    - id: version
      uses: pulumi/provider-version-action@v1
    outputs:
      version: ${{ steps.version.outputs.version }}
  build:
    runs-on: ubuntu-latest
    needs: version
    steps:
    - name: Print version
      run: echo "${{ needs.version.outputs.version }}"
```

## Scenarios

This action supports 3 build scenarios:

1. Pushing a version tag beginning with "v" (e.g. `v1.2.3`). The version from the tag will be used e.g. `1.2.3`
2. Pushing to a main branch. An alpha version will be generated e.g. `1.2.3-alpha.1577836800`
3. Building a pull request. An alpha version will be generated, with a shorthash suffix e.g. `1.2.3-alpha.1577836800+699a10d`

### Major Versions

When we're wanting to build for a different major version from the last release, we can do this using two methods:

1. Use a version branch containing just the major version number e.g. (`v1` or `v7`). Pushing to this branch, or opening a pull request with this branch as the "base" will use this major version.
2. Add the label `needs-release/major` to a pull request. This will cause the version number to be incremented by a major increment instead of a minor increment.

After a major version upgrade PR is merged, the next build of the default branch will also use the new major version.

Note: If both a version branch and a `needs-release/major` label used, the version branch will take priority.

## Alpha Version Format

When building a branch or a pull-request, an alpha version will be generated with the following features:

```
2.43.0-alpha.1577836800+699a10d
| |  |   |       |         |
| |  |   |       |      ShortHash
| |  |   |   Timestamp
| |  | Label
| |  Patch
| Minor
Major
```

- The major, minor and patch numbers are taken from the latest release and incremented to the next minor version.
- The alpha label.
- Commit timestamp to order pre-releases sequentially.
- Short hash of the commit to help identify the source where the release originated.
