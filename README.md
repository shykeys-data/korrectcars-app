# Korrect Cars

A full-stack car marketplace for Lagos, Nigeria, live at **[korrectcars.com](https://www.korrectcars.com)**. Customers can buy inspected cars outright, pay in instalments through credit partners ("Pay Small Small"), or swap their car with a verified owner.

Rebuilt from a WordPress site into a custom Node.js, Express, React and MySQL application.

![Korrect Cars home page](docs/screenshots/home.jpg)

![Pay Small Small instalment calculator](docs/screenshots/pay-small-small.jpg)

## Features

- **Car listings** with search, imported from the old WordPress site
- **Pay Small Small:** an instalment calculator (40% minimum deposit, 6 to 48 month terms) and a 3-step application sent to credit partners
- **Korrect Swap:** peer-to-peer car exchange, with private document uploads visible only to staff
- **Accounts** with email verification, plus two-factor login (TOTP)
- **Admin dashboard** for cars, swaps, content and site settings
- **SEO:** server-rendered pages, JSON-LD structured data and an XML sitemap
- **Image handling:** uploads resized and converted to WebP

## Tech stack

| Layer | Tools |
| --- | --- |
| Front end | React 18, esbuild |
| Back end | Node.js, Express |
| Database | MySQL (mysql2); tables are created on first start |
| Security | Helmet, rate limiting, CSRF protection, bcrypt password hashing, JWT sessions, Zod input validation |
| Hosting | DirectAdmin Node.js app (Passenger) |

## Project structure

- `app.js`: start file for DirectAdmin "Setup Node.js App"
- `server/`: Express API, MySQL data layer, security, server-rendered SEO
- `client/`: React source; build with `node client/build.js` (outputs to `dist/`)
- `seed/`: cars, blog posts and pages imported from the old WordPress site, loaded when the database is empty
- `uploads/public`: car, blog and swap photos; `uploads/private`: swap papers (staff only)

## Running it

1. Copy `.env.example` to `.env` and fill in your MySQL details.
2. Install and build: `npm install`, then `node client/build.js`.
3. Start: `node app.js`.

Real credentials live only in `.env` and server environment variables, never in this repository.
