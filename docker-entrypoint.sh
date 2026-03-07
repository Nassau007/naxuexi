#!/bin/sh
set -e
echo "Ensuring /data directory exists and is writable..."
mkdir -p /data
chmod 777 /data
echo "Running database migrations..."
node node_modules/prisma/build/index.js db push --skip-generate
echo "Starting server..."
node server.js
