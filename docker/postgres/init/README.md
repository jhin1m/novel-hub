# Script khởi tạo Postgres

Các file `.sh`/`.sql` ở đây được mount vào `/docker-entrypoint-initdb.d` và **chỉ chạy khi volume `pgdata` còn trống** (lần `pnpm infra:up` đầu tiên).

- `01-create-test-db.sh`: tạo DB `<POSTGRES_DB>_test` cho `pnpm test:int` và `pnpm test:e2e`.

## Lưu ý

- Đổi `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` sau lần khởi tạo đầu **không có tác dụng**: Postgres giữ thông tin cũ trong volume.
- Volume đã có từ trước nên DB test chưa được tạo thì tạo tay:

  ```sh
  docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE DATABASE \"${POSTGRES_DB}_test\""'
  ```

- Hoặc xoá sạch dữ liệu dev rồi khởi tạo lại (mất toàn bộ dữ liệu Postgres, Redis, Meilisearch):

  ```sh
  docker compose down -v && pnpm infra:up
  ```
