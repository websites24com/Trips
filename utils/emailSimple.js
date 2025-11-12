require('dotenv').config();
const nodemailer = require('nodemailer');

// configure the AttHost transporter
const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  /**
   * Send email via AttHost SMTP
   */
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: options.email,
    subject: options.subject,
    html: options.html,
    text: options.text || options.html?.replace(/<[^>]+>/g, ' ').trim(),
  };

  console.log(mailOptions);
  await transporter.sendMail(mailOptions);
};
module.exports = sendEmail;
