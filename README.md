# Smart AI Inventory (Node.js + TensorFlow.js + React + MUI + MySQL)

This project contains:
- backend/ : Express + TFJS + Sequelize (MySQL) service
- frontend/ : React + MUI dashboard

## Quickstart (server)
1. Prepare MySQL database and set env vars:
   - DB_HOST, DB_NAME, DB_USER, DB_PASS
2. Install backend deps:
   ```
   cd backend
   npm install
   ```
3. Train models (optional, uses sales API):
   ```
   npm run train
   ```
4. Start backend:
   ```
   npm start
   ```

## Frontend
```
cd frontend
npm install
npm start
```

Frontend expects backend proxy at `/api` (development) or configure reverse proxy in production.

