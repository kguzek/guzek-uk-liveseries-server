#!/bin/bash

NAMESPACE='liveseries'

for dockerfile in ./Dockerfile.*; do
  repository=${dockerfile#./Dockerfile.}
  tag="$NAMESPACE/$repository:latest"
  # DOCKER_TOKEN=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:$NAMESPACE/$repository:pull" | jq -r '.token')
  # REMOTE_MANIFEST=$(curl -sH "Authorization: Bearer $DOCKER_TOKEN" "https://registry.hub.docker.com/v2/$NAMESPACE/$repository/manifests/latest" | jq -r .layers[0].digest)
  # LOCAL_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$tag" | cut -d '@' -f 2)

  echo "Building $repository..."
  build_output=$(docker build -t "$tag" -f "$dockerfile" . 2>&1)

  total_steps=$(grep -E '^(RUN|WORKDIR|COPY)' $dockerfile | wc -l)
  cached_steps=$(echo "$build_output" | grep -c "CACHED")

  echo -n "$cached_steps/$total_steps build steps were cached. "
  if [[ "$cached_steps" -lt "$total_steps" ]]; then
    echo "Pushing image..."
    docker push "$tag"
  else
    echo "Skipping push."
  fi
  echo
done
