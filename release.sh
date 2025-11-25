#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if version is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Version number required${NC}"
    echo "Usage: npm run release <version>"
    echo "Example: npm run release 1.7.0"
    exit 1
fi

VERSION=$1

# Validate version format (should be X.Y.Z without 'v' prefix)
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${RED}Error: Version must be in format X.Y.Z (e.g., 1.7.0)${NC}"
    exit 1
fi

TAG="v${VERSION}"

echo -e "${YELLOW}Creating release ${TAG}${NC}"

# Ensure we're on main and up to date
echo "Checking out main branch..."
git checkout main
git pull origin main

# Run tests
echo "Running tests..."
npm test

# Build
echo "Building..."
npm run build

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo -e "${RED}Error: You have uncommitted changes. Please commit or stash them first.${NC}"
    git status --short
    exit 1
fi

# Update package.json version
echo "Updating package.json version to ${VERSION}..."
npm version ${VERSION} --no-git-tag-version
git add package.json package-lock.json
git commit -m "Bump version to ${VERSION}"
git push origin main

# Create and push tag
echo "Creating tag ${TAG}..."
git tag ${TAG}
git push origin ${TAG}

echo -e "${GREEN}✓ Release ${TAG} created successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Monitor the release workflow: https://github.com/pulumi/provider-version-action/actions/workflows/release.yml"
echo "2. Edit release notes if needed: https://github.com/pulumi/provider-version-action/releases"
