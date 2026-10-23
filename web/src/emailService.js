const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter with fallback testing account (Ethereal)
let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_USER !== 'mock_user@ethereal.email') {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    // Generate automatic test account on ethereal for demo/unit testing
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
  }

  return transporter;
}

async function sendPrepaymentNotification(userEmail, userName, loanName, amount, strategy) {
  try {
    const mailer = await getTransporter();
    const info = await mailer.sendMail({
      from: '"LoanWise Financial" <no-reply@loanwise.financial>',
      to: userEmail,
      subject: `Loan Prepayment Confirmed: ${loanName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">Prepayment Confirmation</h2>
          <p style="color: #475569; font-size: 15px;">Hello <strong>${userName}</strong>,</p>
          <p style="color: #475569; font-size: 15px;">Your extra principal prepayment has been successfully recorded and processed against your loan.</p>
          <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 4px 0; color: #1e293b;"><strong>Loan Account:</strong> ${loanName}</p>
            <p style="margin: 4px 0; color: #1e293b;"><strong>Prepayment Amount:</strong> ₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            <p style="margin: 4px 0; color: #1e293b;"><strong>Strategy Tag:</strong> ${strategy}</p>
          </div>
          <p style="color: #64748b; font-size: 13px;">Thank you for using LoanWise to accelerate your debt freedom.</p>
        </div>
      `
    });

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info)
    };
  } catch (err) {
    console.error('[EmailService] Error dispatching email:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendPrepaymentNotification
};
