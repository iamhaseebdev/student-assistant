// Backend/controller/chat.controller.js
import { getStudyChatResponse } from "../services/chat.service.js";

async function handleStudyChat(req, res) {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ 
                success: false, 
                message: "Messages array is required" 
            });
        }

        const reply = await getStudyChatResponse(messages);

        return res.status(200).json({
            success: true,
            reply
        });

    } catch (error) {
        console.error("Study Chatbot Controller Error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error in Chatbot"
        });
    }
}

// Separate Export at Bottom
export { handleStudyChat };