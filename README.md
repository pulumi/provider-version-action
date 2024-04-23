# Provider Version Action

This action calculates the version to be used during a Pulumi provider build.

The calculated version is always valid [semver 2.0.0](https://semver.org/) – with no leading "v".

## Usage

```yaml
- uses: pulumi/provider-version-action
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
- uses: pulumi/provider-version-action
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
  uses: pulumi/provider-version-action
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
      uses: pulumi/provider-version-action
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

1. Pushing a version tag beginning with "v" (e.g. `v1.2.3`). The version from the tag will be used.
2. Pushing to a main branch. An alpha version will be generated.
3. Building a pull request. An alpha version will be generated.

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
- Commit timestamp to order pre-releases.
- Short hash of the commit to help identify the source where the release originated.
