#!/bin/bash

NAMESPACE='liveseries'

for dockerfile in ./Dockerfile.*; do
  repository=${dockerfile#./Dockerfile.}
  tag="registry.guzek.uk/$NAMESPACE/$repository:latest"

  build_image() {
    if [[ $ENABLE_BUILDX_CACHE ]]; then
      # Used for GitHub Actions caching
      docker buildx build \
        --cache-from=type=local,src=/var/cache/.buildx-cache \
        --cache-to=type=local,dest=/var/cache/.buildx-cache \
        -t "$tag" -f "$dockerfile" .
    else
      docker build -t "$tag" -f "$dockerfile" . 2>&1
    fi
  }

  echo "Building $repository..."
  build_output=$(build_image)

  total_steps=$(grep -E '^(RUN|WORKDIR|COPY)' $dockerfile | wc -l)
  cached_steps=$(echo "$build_output" | grep -c "CACHED")

  echo -n "$cached_steps/$total_steps build steps were cached. "
  if [[ "$cached_steps" -lt "$total_steps" || $1 = "--force" ]]; then
    echo "Pushing image..."
    docker push "$tag"
  else
    echo "Skipping push."
  fi
  echo
done
