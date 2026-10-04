#!/bin/sh
# Tạo DB test `<POSTGRES_DB>_test` cạnh DB chính. Chỉ chạy khi volume còn trống.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE DATABASE \"${POSTGRES_DB}_test\""
