// Vercel entry point for the SmartVerify Express application.
const app = require('./backend/server');

// Keep local `npm start` behavior while allowing Vercel to manage the serverless runtime.
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`SmartVerify running at http://localhost:${PORT}`);
  });
}

module.exports = app;
