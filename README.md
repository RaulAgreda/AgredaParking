# Agreda Parking

Aplicacion web para guardar la ubicacion GPS de uno o varios coches y abrir la ruta en Google Maps.

## Base de datos sencilla

Para Vercel, usa Neon Postgres desde Vercel Marketplace. Vercel ya no recomienda `@vercel/postgres`; ahora la opcion sencilla es conectar una base Postgres gestionada como Neon y usar `DATABASE_URL`.

Variables necesarias:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require"
SESSION_SECRET="cambia-esto-por-un-texto-largo-de-32-caracteres-minimo"
```

La API crea automaticamente las tablas `users` y `cars` la primera vez que se usa.

## Uso local

```powershell
npm install
npm run dev
```

Abre la URL que muestre Vercel CLI.

## Despliegue

1. Sube el proyecto a GitHub.
2. Importalo en Vercel.
3. En Vercel Marketplace, crea/conecta una base Neon Postgres.
4. Configura `DATABASE_URL` y `SESSION_SECRET` en Project Settings -> Environment Variables.
5. Despliega.
