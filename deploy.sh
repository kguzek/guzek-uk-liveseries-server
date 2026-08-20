#!/bin/bash
set -Eeuo pipefail

REGISTRY_HOSTNAME="${REGISTRY_HOSTNAME:-registry.guzek.uk}"
PROJECT_NAME='liveseries'
BUILDX_CACHE_DIR="${BUILDX_CACHE_DIR:-}"
SCRIPT_ARG="${1:-}"

is_dry_run() {
  [[ "$SCRIPT_ARG" = "--dry-run" ]]
}

if is_dry_run; then
  echo "Starting build only (dry run option provided)..."
else
  echo "Starting build and push to registry..."
fi

if [[ -n "$BUILDX_CACHE_DIR" ]]; then
  echo "Caching build artifacts in '$BUILDX_CACHE_DIR'"
  mkdir -p "$BUILDX_CACHE_DIR"
fi


for dockerfile in ./Dockerfile.*; do
  repository=${dockerfile#./Dockerfile.}
  tag="$REGISTRY_HOSTNAME/$PROJECT_NAME/$repository:latest"

  build_image() {
    if [[ -n "$BUILDX_CACHE_DIR" ]]; then
      # Used for GitHub Actions caching
      docker buildx build \
        --cache-from=type=local,src="$BUILDX_CACHE_DIR" \
        --cache-to=type=local,dest="$BUILDX_CACHE_DIR" \
        --load \
        -t "$tag" -f "$dockerfile" .
    else
      docker build -t "$tag" -f "$dockerfile" . 2>&1
    fi
  }

  echo
  echo "Building $PROJECT_NAME/$repository..."
  build_output=$(build_image)

  total_steps=$(grep -cE '^(RUN|WORKDIR|COPY)' "$dockerfile" || true)
  cached_steps=$(grep -c "CACHED" <<< "$build_output" || true)

  echo "$cached_steps/$total_steps build steps were cached. "
  if is_dry_run; then
    echo "Skipping push (dry run)."
  elif [[ "$cached_steps" -lt "$total_steps" || "$SCRIPT_ARG" = "--force" ]]; then
    echo "Pushing image..."
    docker push "$tag"
    digest=$(docker image inspect "$tag" --format '{{index .RepoDigests 0}}' | grep "^$REGISTRY_HOSTNAME/")
    cosign sign --yes --new-bundle-format=false --use-signing-config=false "$digest"
  else
    echo "Skipping push (image unchanged)."
  fi
done
