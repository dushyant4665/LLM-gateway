// Health Controller - System health and liveness check

function getHealthStatus(req, res) {
  return res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  getHealthStatus,
};
