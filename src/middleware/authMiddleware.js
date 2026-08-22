const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const VALID_ROLES = ["staff", "admin", "manager", "cappho", "chuyenvien"];

const middlewareController = {
  verifyToken: async (req, res, next) => {
    const token = req.headers.authorization;
    if (token) {
      const accessToken = token.split(" ")[1];
      try {
        const decoded = jwt.verify(
          accessToken,
          process.env.ACCESS_TOKEN_SECRET
        );
        const user = await User.findById(decoded.userId).select("-password");
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        
        // Kiểm tra role không được null hoặc undefined
        if (!VALID_ROLES.includes(user.role)) {
          return res.status(403).json({ message: "User role is invalid or missing" });
        }
        req.user = user;
        next();
      } catch (error) {
        return res.status(403).json({ message: "Token is not valid" });
      }
    } else {
      res.status(401).json({ message: "You're not authenticated" });
    }
  },
  verifyAdmin: (req, res, next) => {
    middlewareController.verifyToken(req, res, () => {
      if (req.user && req.user.role === "admin") {
        next();
      } else {
        return res.status(403).json({ message: "Access denied - Admin only" });
      }
    });
  },
  verifyManager:(req,res,next)=> {
    middlewareController.verifyToken(req, res, () =>{
      if (req.user && (req.user.role === "manager"||req.user.role === "admin")){
        next();
      } else {
        return res.status(403).json({ message: "Access denied - Admin or Manager only" });
      }
    }
  )
  }
};
module.exports = middlewareController;