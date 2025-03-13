#!/bin/bash

NAMESPACE='liveseries'

for dockerfile in ./Dockerfile.*; do
  repository=${dockerfile#./Dockerfile.}
  tag="$NAMESPACE/$repository:latest"
  docker build -t "$tag" -f "$dockerfile" .
  docker push "$tag"
done
