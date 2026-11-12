import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // KaTeX formula CSS

import apiClient from '../api/apiClient';
import styles from './Chatbot.module.css';

function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Salam! Main aapka AI Study Assistant hu. Aap mujhse kisi bhi study topic par sawaal pooch sakte hain.'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const apiPayload = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content
      }));

      const res = await apiClient.post('/assistant/chat/study-bot', {
        messages: apiPayload
      });

      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: res.data.reply }
      ]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages([
        ...updatedMessages,
        {
          role: 'assistant',
          content: 'Maaf kijiye, response nahi mil paya. Thodi der baad try karein.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        className={styles.floatingBtn}
        onClick={() => setIsOpen(!isOpen)}
        title="Open Study Assistant Chatbot"
      >
        {isOpen ? '✖' : '🎓'}
      </button>

      {isOpen && (
        <div className={styles.chatContainer}>
          <div className={styles.chatHeader}>
            <div className={styles.chatTitle}>
              <span>🤖</span> AI Study Bot
            </div>
            <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>
              ✖
            </button>
          </div>

          <div className={styles.messagesBox}>
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`${styles.message} ${
                  msg.role === 'user' ? styles.userMsg : styles.botMsg
                }`}
              >
                {/* Enabled LaTeX Math Plugins */}
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            ))}

            {loading && (
              <div className={`${styles.message} ${styles.botMsg}`}>
                Generating answer...
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          <form onSubmit={handleSendMessage} className={styles.inputForm}>
            <input
              type="text"
              placeholder="Ask a study question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className={styles.chatInput}
            />
            <button type="submit" disabled={loading} className={styles.sendBtn}>
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default Chatbot;