const mongoose = require("mongoose");
const OpenAI = require("openai");
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const Chat = require("./chat");

const app = express();

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("NovaAI Backend is Running!");
});

// Load all saved chats
app.get("/chats", async (req, res) => {
  try {
    const chats = await Chat.find().sort({ createdAt: -1 });
    res.json(chats);
  } catch (error) {
    console.log("Chat history error:", error);
    res.status(500).json({ error: "Could not load chat history." });
  }
});

// Load one saved chat
app.get("/chats/:id", async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({ error: "Chat not found." });
    }

    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: "Could not load this chat." });
  }
});

// Delete a saved chat
app.delete("/chats/:id", async (req, res) => {
  try {
    const chat = await Chat.findByIdAndDelete(req.params.id);

    if (!chat) {
      return res.status(404).json({ error: "Chat not found." });
    }

    res.json({ message: "Chat deleted successfully!" });
  } catch (error) {
    res.status(500).json({ error: "Could not delete chat." });
  }
});

// Send a new message with Stop Generating support
app.post("/chat", async (req, res) => {
  const controller = new AbortController();

  // Cancel AI request if the browser disconnects
  res.on("close", () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  try {
    const { message, chatId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Please enter a message." });
    }

    const response = await openai.responses.create(
      {
        model: "openai/gpt-oss-120b",
        input: message.trim(),
      },
      { signal: controller.signal }
    );

    if (controller.signal.aborted) return;

    const reply = response.output_text;
    let chat = null;

    if (chatId) {
      chat = await Chat.findById(chatId);

      if (!chat) {
        return res.status(404).json({ error: "Chat not found." });
      }
    } else {
      let title = message.slice(0, 40);

      try {
        const titleResponse = await openai.responses.create(
          {
            model: "openai/gpt-oss-120b",
            input: `Create a short 3 to 5 word title for this conversation. Return only the title: ${message}`,
          },
          { signal: controller.signal }
        );

        if (controller.signal.aborted) return;

        if (titleResponse.output_text) {
          title = titleResponse.output_text.trim().slice(0, 40);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.log("Title generation error:", error.message);
      }

      chat = new Chat({
        title,
        messages: [],
      });
    }

    if (controller.signal.aborted) return;

    chat.messages.push(
      { role: "user", content: message.trim() },
      { role: "assistant", content: reply }
    );

    await chat.save();

    if (!controller.signal.aborted && !res.headersSent) {
      res.json({
        reply,
        chatId: chat._id,
      });
    }
  } catch (error) {
    if (controller.signal.aborted || error.name === "AbortError") {
      console.log("AI request cancelled by user.");
      return;
    }

    console.log("AI Error:", error);

    if (!res.headersSent && !res.destroyed) {
      res.status(500).json({
        error: error.message || "NovaAI could not generate a response.",
      });
    }
  }
});

// Edit an existing user message
app.post("/chat/edit", async (req, res) => {
  try {
    const { chatId, messageIndex, message } = req.body;

    if (
      !chatId ||
      !Number.isInteger(messageIndex) ||
      !message ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "Chat ID, message index and edited message are required.",
      });
    }

    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ error: "Chat not found." });
    }

    if (
      messageIndex < 0 ||
      messageIndex >= chat.messages.length ||
      chat.messages[messageIndex].role !== "user"
    ) {
      return res.status(400).json({ error: "Invalid message to edit." });
    }

    const previousMessages = chat.messages
      .slice(0, messageIndex)
      .map((item) => `${item.role}: ${item.content}`)
      .join("\n");

    const prompt = `${previousMessages ? previousMessages + "\n" : ""}
user: ${message.trim()}

Please respond to the user's latest message using the conversation context above.`;

    const response = await openai.responses.create({
      model: "openai/gpt-oss-120b",
      input: prompt,
    });

    const reply = response.output_text;

    chat.messages.splice(messageIndex);

    chat.messages.push(
      { role: "user", content: message.trim() },
      { role: "assistant", content: reply }
    );

    await chat.save();

    res.json({
      reply,
      chatId: chat._id,
      messages: chat.messages,
    });
  } catch (error) {
    console.log("Edit message error:", error);

    res.status(500).json({
      error: error.message || "Could not edit message.",
    });
  }
});

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully!"))
  .catch((err) => console.log("MongoDB Error:", err));

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`NovaAI Server running on port ${PORT}`);
});