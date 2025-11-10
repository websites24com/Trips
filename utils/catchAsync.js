// to avoid write try/catch in every route
// it takes FUNCTION as an argument

module.exports = (fn) => (req, res, next) => fn(req, res, next).catch(next);
