# Korrect Cars — MySQL + Express + React + Node

- `app.js` — start file for DirectAdmin "Setup Node.js App" (Passenger)
- `server/` — Express API, MySQL data layer (tables are created on first start), security, server-rendered SEO
- `dist/` — built React site (rebuild with `node client/build.js` after changing `client/src`)
- `seed/` — live cars, blog posts and pages imported from the old WordPress site (loaded automatically when the database is empty)
- `uploads/public` — car, blog and swap photos; `uploads/private` — swap papers (staff only)

Admin: https://www.korrectcars.com/myadm (register first with an ADMIN_EMAILS address to become admin).
