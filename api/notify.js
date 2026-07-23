const ALLOWED_ORIGINS = [
  'https://portal.voctotechnologies.com',
  'https://vocto-expense-system.vercel.app'
];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

async function verifySupabaseToken(token, supabaseUrl, serviceRoleKey) {
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${token}` }
  });
  if (!r.ok) return null;
  return r.json();
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !serviceRoleKey) return res.status(500).json({ error: 'Not configured' });
  if (!apiKey) return res.status(500).json({ error: 'Email service not configured' });

  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await verifySupabaseToken(token, supabaseUrl, serviceRoleKey);
  if (!user?.email) return res.status(401).json({ error: 'Unauthorized' });

  const { event, type, claimNumber, claimTitle, amount, employeeEmail, submittedBy, poNumber, vendorName, total, purpose } = req.body || {};
  const amtFormatted = amount ? `₹${Number(amount).toLocaleString('en-IN')}` : '';
  const portalUrl = 'https://portal.voctotechnologies.com';

  let to, subject, html;
  const eventKey = event || type;

  switch (eventKey) {
    case 'po_submitted': {
      const poAmt = total ? `₹${Number(total).toLocaleString('en-IN')}` : '';
      to = req.body.to;
      subject = `New PO Submitted for Review — ${poNumber}`;
      html = `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
        <div style="background:#0C1F3D;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-weight:700;font-size:16px">Vocto Technologies</span>
          <span style="color:#F4721B;margin-left:8px;font-size:12px">Expense System</span>
        </div>
        <div style="background:#fff;border:1px solid #E8ECF3;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="margin:0 0 16px;font-size:18px;color:#0C1F3D">New Purchase Order Needs Review</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px;width:140px">PO Number</td><td style="padding:8px 0;font-weight:600;font-size:13px">${poNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Vendor</td><td style="padding:8px 0;font-size:13px">${vendorName || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Total</td><td style="padding:8px 0;font-weight:700;font-size:14px;color:#F4721B">${poAmt}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Submitted by</td><td style="padding:8px 0;font-size:13px">${submittedBy || '—'}</td></tr>
          </table>
          <a href="${portalUrl}/accounts" style="display:inline-block;background:#0C1F3D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Review on Accounts Dashboard →</a>
        </div>
      </div>`;
      break;
    }

    case 'advance_submitted': {
      const advAmt = amount ? `₹${Number(amount).toLocaleString('en-IN')}` : '';
      to = req.body.to;
      subject = `Advance Requisition Submitted — ${purpose || 'Review Required'}`;
      html = `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
        <div style="background:#0C1F3D;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-weight:700;font-size:16px">Vocto Technologies</span>
          <span style="color:#F4721B;margin-left:8px;font-size:12px">Expense System</span>
        </div>
        <div style="background:#fff;border:1px solid #E8ECF3;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="margin:0 0 16px;font-size:18px;color:#0C1F3D">New Advance Requisition</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px;width:140px">Purpose</td><td style="padding:8px 0;font-weight:600;font-size:13px">${purpose || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Amount</td><td style="padding:8px 0;font-weight:700;font-size:14px;color:#F4721B">${advAmt}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Submitted by</td><td style="padding:8px 0;font-size:13px">${submittedBy || '—'}</td></tr>
          </table>
          <a href="${portalUrl}/accounts" style="display:inline-block;background:#0C1F3D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Review on Accounts Dashboard →</a>
        </div>
      </div>`;
      break;
    }

    case 'submitted':
      to = 'accounts@voctotechnologies.com';
      subject = `New Claim Submitted — ${claimNumber}`;
      html = `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
        <div style="background:#0C1F3D;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-weight:700;font-size:16px">Vocto Technologies</span>
          <span style="color:#F4721B;margin-left:8px;font-size:12px">Expense System</span>
        </div>
        <div style="background:#fff;border:1px solid #E8ECF3;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="margin:0 0 16px;font-size:18px;color:#0C1F3D">New Claim Needs Verification</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px;width:140px">Claim ID</td><td style="padding:8px 0;font-weight:600;font-size:13px">${claimNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Title</td><td style="padding:8px 0;font-size:13px">${claimTitle || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Amount</td><td style="padding:8px 0;font-weight:700;font-size:14px;color:#F4721B">${amtFormatted}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Submitted by</td><td style="padding:8px 0;font-size:13px">${submittedBy || employeeEmail || '—'}</td></tr>
          </table>
          <a href="${portalUrl}/accounts" style="display:inline-block;background:#0C1F3D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Review on Accounts Dashboard →</a>
        </div>
      </div>`;
      break;

    case 'verified':
      to = 'md@voctotechnologies.com';
      subject = `Claim Ready for Approval — ${claimNumber}`;
      html = `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
        <div style="background:#0C1F3D;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-weight:700;font-size:16px">Vocto Technologies</span>
          <span style="color:#F4721B;margin-left:8px;font-size:12px">Expense System</span>
        </div>
        <div style="background:#fff;border:1px solid #E8ECF3;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="margin:0 0 16px;font-size:18px;color:#0C1F3D">Claim Awaiting Your Approval</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px;width:140px">Claim ID</td><td style="padding:8px 0;font-weight:600;font-size:13px">${claimNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Title</td><td style="padding:8px 0;font-size:13px">${claimTitle || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Amount</td><td style="padding:8px 0;font-weight:700;font-size:14px;color:#F4721B">${amtFormatted}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Submitted by</td><td style="padding:8px 0;font-size:13px">${submittedBy || '—'}</td></tr>
          </table>
          <a href="${portalUrl}/md" style="display:inline-block;background:#0C1F3D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Review on MD Dashboard →</a>
        </div>
      </div>`;
      break;

    case 'approved':
      to = 'accounts@voctotechnologies.com';
      subject = `MD Approved — Ready for Payment — ${claimNumber}`;
      html = `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
        <div style="background:#0C1F3D;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-weight:700;font-size:16px">Vocto Technologies</span>
          <span style="color:#F4721B;margin-left:8px;font-size:12px">Expense System</span>
        </div>
        <div style="background:#fff;border:1px solid #E8ECF3;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="margin:0 0 16px;font-size:18px;color:#0C1F3D">Claim Approved — Release Payment</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px;width:140px">Claim ID</td><td style="padding:8px 0;font-weight:600;font-size:13px">${claimNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Title</td><td style="padding:8px 0;font-size:13px">${claimTitle || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Amount</td><td style="padding:8px 0;font-weight:700;font-size:14px;color:#F4721B">${amtFormatted}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Submitted by</td><td style="padding:8px 0;font-size:13px">${submittedBy || '—'}</td></tr>
          </table>
          <a href="${portalUrl}/accounts" style="display:inline-block;background:#F4721B;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Release Payment →</a>
        </div>
      </div>`;
      break;

    case 'paid':
      if (!employeeEmail) return res.status(400).json({ error: 'employeeEmail required for paid event' });
      to = employeeEmail;
      subject = `Payment Released — ${claimNumber}`;
      html = `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
        <div style="background:#0C1F3D;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-weight:700;font-size:16px">Vocto Technologies</span>
          <span style="color:#F4721B;margin-left:8px;font-size:12px">Expense System</span>
        </div>
        <div style="background:#fff;border:1px solid #E8ECF3;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="margin:0 0 16px;font-size:18px;color:#0C1F3D">Payment Released ✓</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px;width:140px">Claim ID</td><td style="padding:8px 0;font-weight:600;font-size:13px">${claimNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Title</td><td style="padding:8px 0;font-size:13px">${claimTitle || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Amount</td><td style="padding:8px 0;font-weight:700;font-size:14px;color:#0F9B6A">${amtFormatted}</td></tr>
          </table>
          <p style="color:#8A9BB0;font-size:12px">Please allow 2–3 working days for the amount to reflect in your account.</p>
          <a href="${portalUrl}/dashboard" style="display:inline-block;background:#0C1F3D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">View My Claims →</a>
        </div>
      </div>`;
      break;

    case 'rejected':
      if (!employeeEmail) return res.status(400).json({ error: 'employeeEmail required for rejected event' });
      to = employeeEmail;
      subject = `Claim Rejected — ${claimNumber}`;
      html = `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
        <div style="background:#0C1F3D;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-weight:700;font-size:16px">Vocto Technologies</span>
          <span style="color:#F4721B;margin-left:8px;font-size:12px">Expense System</span>
        </div>
        <div style="background:#fff;border:1px solid #E8ECF3;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="margin:0 0 16px;font-size:18px;color:#C0392B">Claim Rejected</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px;width:140px">Claim ID</td><td style="padding:8px 0;font-weight:600;font-size:13px">${claimNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Title</td><td style="padding:8px 0;font-size:13px">${claimTitle || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Amount</td><td style="padding:8px 0;font-size:13px">${amtFormatted}</td></tr>
          </table>
          <a href="${portalUrl}/dashboard" style="display:inline-block;background:#0C1F3D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">View My Claims →</a>
        </div>
      </div>`;
      break;

    case 'receipt':
      if (!employeeEmail) return res.status(400).json({ error: 'employeeEmail required for receipt event' });
      to = employeeEmail;
      subject = `Voucher Submitted — ${claimNumber}`;
      html = `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
        <div style="background:#0C1F3D;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-weight:700;font-size:16px">Vocto Technologies</span>
          <span style="color:#F4721B;margin-left:8px;font-size:12px">Expense System</span>
        </div>
        <div style="background:#fff;border:1px solid #E8ECF3;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="margin:0 0 16px;font-size:18px;color:#0C1F3D">Voucher Submitted Successfully</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px;width:140px">Claim ID</td><td style="padding:8px 0;font-weight:600;font-size:13px">${claimNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Title</td><td style="padding:8px 0;font-size:13px">${claimTitle || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Amount</td><td style="padding:8px 0;font-weight:700;font-size:14px;color:#F4721B">${amtFormatted}</td></tr>
          </table>
          <a href="${portalUrl}/dashboard" style="display:inline-block;background:#0C1F3D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">View My Claims →</a>
        </div>
      </div>`;
      break;

    case 'invoice_sent': {
      const { invoiceNumber, customerName, dueDate } = req.body;
      const invTotal = req.body.total ? `₹${Number(req.body.total).toLocaleString('en-IN')}` : '';
      to = req.body.to || user.email;
      subject = `Invoice Finalized — ${invoiceNumber}`;
      html = `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
        <div style="background:#0C1F3D;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-weight:700;font-size:16px">Vocto Technologies</span>
          <span style="color:#F4721B;margin-left:8px;font-size:12px">Billing</span>
        </div>
        <div style="background:#fff;border:1px solid #E8ECF3;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="margin:0 0 16px;font-size:18px;color:#0C1F3D">Invoice Finalized</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px;width:140px">Invoice No</td><td style="padding:8px 0;font-weight:600;font-size:13px">${invoiceNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Customer</td><td style="padding:8px 0;font-size:13px">${customerName || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Total</td><td style="padding:8px 0;font-weight:700;font-size:14px;color:#F4721B">${invTotal}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Due Date</td><td style="padding:8px 0;font-size:13px">${dueDate || '—'}</td></tr>
          </table>
          <a href="${portalUrl}/billing" style="display:inline-block;background:#0C1F3D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open Billing →</a>
        </div>
      </div>`;
      break;
    }

    case 'payment_received': {
      const { invoiceNumber, customerName, paymentNumber } = req.body;
      const payAmt = req.body.amount ? `₹${Number(req.body.amount).toLocaleString('en-IN')}` : '';
      to = req.body.to || user.email;
      subject = `Payment Received — ${payAmt} against ${invoiceNumber}`;
      html = `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
        <div style="background:#0C1F3D;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-weight:700;font-size:16px">Vocto Technologies</span>
          <span style="color:#F4721B;margin-left:8px;font-size:12px">Billing</span>
        </div>
        <div style="background:#fff;border:1px solid #E8ECF3;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="margin:0 0 16px;font-size:18px;color:#2E7D32">Payment Received</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px;width:140px">Receipt No</td><td style="padding:8px 0;font-weight:600;font-size:13px">${paymentNumber || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Invoice</td><td style="padding:8px 0;font-size:13px">${invoiceNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Customer</td><td style="padding:8px 0;font-size:13px">${customerName || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Amount</td><td style="padding:8px 0;font-weight:700;font-size:14px;color:#2E7D32">${payAmt}</td></tr>
          </table>
          <a href="${portalUrl}/billing" style="display:inline-block;background:#0C1F3D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open Billing →</a>
        </div>
      </div>`;
      break;
    }

    case 'overdue_reminder': {
      const { invoiceNumber, customerName, dueDate, customerEmail } = req.body;
      const balance = `₹${Number((req.body.total || 0) - (req.body.amountPaid || 0)).toLocaleString('en-IN')}`;
      to = customerEmail || req.body.to || user.email;
      subject = `Payment Reminder — Invoice ${invoiceNumber}`;
      html = `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
        <div style="background:#0C1F3D;padding:16px 24px;border-radius:8px 8px 0 0">
          <span style="color:#fff;font-weight:700;font-size:16px">Vocto Technologies</span>
          <span style="color:#F4721B;margin-left:8px;font-size:12px">Billing</span>
        </div>
        <div style="background:#fff;border:1px solid #E8ECF3;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <h2 style="margin:0 0 16px;font-size:18px;color:#C0392B">Invoice Overdue</h2>
          <p style="font-size:13px;color:#5A6B84;margin:0 0 16px">Dear ${customerName || 'Customer'}, this is a gentle reminder that the following invoice is past its due date.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px;width:140px">Invoice No</td><td style="padding:8px 0;font-weight:600;font-size:13px">${invoiceNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Due Date</td><td style="padding:8px 0;font-size:13px">${dueDate || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Balance Due</td><td style="padding:8px 0;font-weight:700;font-size:14px;color:#C0392B">${balance}</td></tr>
          </table>
          <p style="font-size:12px;color:#8A9BB0;margin:0">Please disregard this reminder if payment has already been made.</p>
        </div>
      </div>`;
      break;
    }

    default:
      return res.status(400).json({ error: 'Unknown event type' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Vocto Expense System <onboarding@resend.dev>', to: [to], subject, html })
    });
    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Email send failed' });
  }
}
