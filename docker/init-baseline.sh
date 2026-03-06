#!/bin/bash
# Create baseline database for snapshot/comparison. Runs on first container init only.
set -e
if ! psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = 'bridge_dashboard_baseline'" | grep -q 1; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE bridge_dashboard_baseline"
  echo "Created database bridge_dashboard_baseline"
fi
