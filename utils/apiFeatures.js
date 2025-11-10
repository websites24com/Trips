// This class handles filtering, sorting, limiting, and pagination for API queries.
// It’s a custom utility used in a Node.js + Express + Mongoose app.
class APIFeatures {
  // The constructor takes two arguments:
  // 1. `query`: a Mongoose query object (e.g., Tour.find()).
  // 2. `queryString`: the query parameters from the Express `req.query` object.
  constructor(query, queryString) {
    this.query = query; // Mongoose query, e.g., Tour.find()
    this.queryString = queryString; // Object from Express request query (req.query)
  }

  // ------------------- FILTERING -------------------
  filter() {
    // 1A) Basic Filtering
    // Create a shallow copy of query parameters object so we can modify it
    const queryObj = { ...this.queryString };

    // These fields should not be used for filtering in the database query
    // because they are used for other features (pagination, sorting, limiting, etc.)
    const excludedFields = ['page', 'sort', 'limit', 'fields'];

    // Loop through excluded fields and remove them from queryObj
    excludedFields.forEach((el) => delete queryObj[el]);

    // Now queryObj only contains filtering criteria (e.g., { difficulty: 'easy', duration: { gte: 5 } })

    // 1B) Advanced Filtering
    // Convert the object to a JSON string to manipulate operators like gte, gt, lte, lt
    let queryStr = JSON.stringify(queryObj);

    // Regular expression replaces "gte", "gt", "lte", "lt" with "$gte", "$gt", "$lte", "$lt"
    // MongoDB requires $ before comparison operators.
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

    // Parse the string back to an object and use it inside the Mongoose .find() query
    // Example: { duration: { $gte: 5 }, difficulty: 'easy' }

    this.query = this.query.find(JSON.parse(queryStr)); // <-- Mongoose method

    // Return `this` to allow method chaining (e.g., features.filter().sort().paginate())
    return this;
  }

  // ------------------- SORTING -------------------
  sort() {
    // If the client specified a sort parameter in the URL (e.g., ?sort=price,ratingsAverage)
    if (this.queryString.sort) {
      // Replace commas with spaces because Mongoose expects space-separated fields
      const sortBy = this.queryString.sort.split(',').join(' ');
      console.log(sortBy);

      // Apply sorting to the Mongoose query (ascending by default)
      this.query = this.query.sort(sortBy); // <-- Mongoose .sort()
    } else {
      // If no sorting specified, sort by creation date descending (latest first)
      this.query = this.query.sort('-createdAt'); // "-" = descending
    }

    // Return the instance for chaining
    return this;
  }

  // ------------------- FIELD LIMITING -------------------
  limitFields() {
    // This feature allows clients to specify which fields to include or exclude in the response
    // e.g., ?fields=name,duration,price
    if (this.queryString.fields) {
      // Convert comma-separated fields to space-separated string (as required by Mongoose)
      const fields = this.queryString.fields.split(',').join(' ');

      // Use Mongoose's select() to include only the specified fields
      this.query = this.query.select(fields);
    } else {
      // If no fields specified, exclude the __v field (internal version key added by Mongoose)
      this.query = this.query.select('-__v'); // "-" means exclude
    }

    // Return the instance for chaining
    return this;
  }

  // ------------------- PAGINATION -------------------
  pagination() {
    // Extract page number and limit from query string (default: page=1, limit=100)
    const page = this.queryString.page * 1 || 1; // Convert string to number using *1
    const limit = this.queryString.limit * 1 || 100;
    const skip = (page - 1) * limit;

    // Example: page=2&limit=10 → skip first 10 results, show next 10 (11–20)
    this.query = this.query.skip(skip).limit(limit); // <-- Mongoose .skip() and .limit()

    // Return the instance for chaining
    return this;
  }
}

// Export the class to make it available in other files (e.g., in the controller)
// CommonJS syntax (Node.js built-in module system)
module.exports = APIFeatures;
