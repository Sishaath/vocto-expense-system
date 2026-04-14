export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { event, claimNumber, claimTitle, amount, employeeEmail, submittedBy } = req.body || {};
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Email service not configured' });

  const amtFormatted = amount ? `₹${Number(amount).toLocaleString('en-IN')}` : '';
  const portalUrl = 'https://vocto-po-system.vercel.app';

  let to, subject, html;

  switch (event) {
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
          <p style="margin:0 0 16px;color:#4A6080">A new expense claim has been submitted and requires your verification.</p>
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
          <p style="margin:0 0 16px;color:#4A6080">An expense claim has been verified by Accounts and is awaiting your approval.</p>
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
          <p style="margin:0 0 16px;color:#4A6080">MD has approved the following claim. Please release payment.</p>
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
          <p style="margin:0 0 16px;color:#4A6080">Your expense claim has been approved and payment has been released.</p>
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
          <p style="margin:0 0 16px;color:#4A6080">Your expense claim has been reviewed and could not be approved at this time.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px;width:140px">Claim ID</td><td style="padding:8px 0;font-weight:600;font-size:13px">${claimNumber}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Title</td><td style="padding:8px 0;font-size:13px">${claimTitle || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#8A9BB0;font-size:13px">Amount</td><td style="padding:8px 0;font-size:13px">${amtFormatted}</td></tr>
          </table>
          <p style="color:#4A6080;font-size:13px">Please log in to the portal to view the rejection reason and resubmit if needed.</p>
          <a href="${portalUrl}/dashboard" style="display:inline-block;background:#0C1F3D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">View My Claims →</a>
        </div>
      </div>`;
      break;

    default:
      return res.status(400).json({ error: 'Unknown event type' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Vocto Expense System <onboarding@resend.dev>',
        to: [to],
        subject,
        html
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Email send failed' });
  }
}
