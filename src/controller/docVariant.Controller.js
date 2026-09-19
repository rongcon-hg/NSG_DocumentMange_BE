const DocVariant = require("../../src/models/docVariant.model")
const Document = require("../../src/models/document.model")
const createDocVariant = async ( req,res ) => {
    const { docVariantName } = req.body;

    try {
        const nameExists = await DocVariant.findOne({ docVariantName });
        if (nameExists) {
            return res.status(400).json({ message: "Document variant already exists" });
        }
        await DocVariant.create({ docVariantName });
        return res.status(200).json({ message: "Document variant created successfully" });
    } catch (error) {
        console.log("Error in createDocVariant controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}

const getAllDocVariant = async ( req,res ) => {
    try {
        const { onlyActive } = req.query;
        const query = {};
        if (onlyActive === "true") {
            query.isActive = { $ne: false };
        }
        const allDocVariants = await DocVariant.find(query).sort({ createdAt: -1 });
        res.status(200).json({ allDocVariants });
    } catch (error) {
        console.log("Error in getAllDocVariant controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}

const toggleDocVariantStatus = async (req, res) => {
    const { docVariantID, isActive } = req.body;
    try {
        const variant = await DocVariant.findById(docVariantID);
        if (!variant) {
            return res.status(404).json({ message: "Document variant not found" });
        }
        variant.isActive = typeof isActive === "boolean" ? isActive : !variant.isActive;
        await variant.save();
        return res.status(200).json({ 
            message: `Đã ${variant.isActive ? "kích hoạt" : "tắt"} loại văn bản thành công`, 
            variant 
        });
    } catch (error) {
        console.error("Error in toggleDocVariantStatus controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}

const deleteDocVariant = async ( req,res ) => {
    const { docVariantID } = req.body;
    try {
        const variant = await DocVariant.findById(docVariantID);
        if (!variant) {
            return res.status(404).json({ message: "Document variant not found" });
        }
        await DocVariant.findByIdAndDelete(docVariantID);
        return res.status(200).json({ message: "Document variant deleted successfully" });
    } catch (error) {
        console.log("Error in deleteDocVariant controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}

const updateDocVariant = async ( req,res ) => {
    const { docVariantID, docVariantName, isActive } = req.body;

    try {
        const variant = await DocVariant.findById(docVariantID);
        if (!variant) {
            return res.status(404).json({ message: "Document variant not found" });
        }
        
        if (docVariantName) {
            const nameExists = await DocVariant.findOne({ docVariantName, _id: { $ne: docVariantID } });
            if (nameExists) {
                return res.status(400).json({ message: "Document variant name already exists" });
            }
            variant.docVariantName = docVariantName;
        }

        if (typeof isActive === "boolean") {
            variant.isActive = isActive;
        }

        await variant.save();
        return res.status(200).json({ message: "Document variant updated successfully", variant });
    } catch (error) {
        console.error("Error in updateDocVariant controller: ", error.message);
        res.status(500).json({ message: "Server Error!", error: error.message });
    }
}

const getTotalDocumentsByVariant = async (req, res) => {
  try {
    const { year } = req.params;

    if (!year) {
      return res.status(400).json({ message: "Vui lòng cung cấp năm (year)" });
    }

    const result = await DocVariant.aggregate([
      {
        $lookup: {
          from: "documents",
          localField: "_id",
          foreignField: "docVariant",
          as: "documents",
          pipeline: [
            {
              $match: {
                year: year
              }
            }
          ]
        }
      },
      {
        $project: {
          _id: 0,
          docVariantId: "$_id",
          docVariantName: 1,
          isActive: { $ifNull: ["$isActive", true] },
          sent: {
            $size: {
              $filter: {
                input: "$documents",
                as: "doc",
                cond: { $eq: ["$$doc.docType", "sent"] }
              }
            }
          },
          received: {
            $size: {
              $filter: {
                input: "$documents",
                as: "doc",
                cond: { $eq: ["$$doc.docType", "received"] }
              }
            }
          }
        }
      }
    ]);

    if (result.length === 0) {
      return res.status(404).json({ message: "Không có dữ liệu cho năm này" });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("❌ Lỗi khi lấy tổng số văn bản:", error);
    res.status(500).json({ message: "Lỗi khi lấy tổng số văn bản", error: error.message });
  }
};

module.exports = {
    createDocVariant,
    getAllDocVariant,
    toggleDocVariantStatus,
    deleteDocVariant,
    updateDocVariant,
    getTotalDocumentsByVariant
 }