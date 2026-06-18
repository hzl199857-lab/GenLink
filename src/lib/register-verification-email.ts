export interface RegisterVerificationEmail {
  subject: string;
  text: string;
  html: string;
}

export function createRegisterVerificationEmail(code: string): RegisterVerificationEmail {
  return {
    subject: "GenLink 注册验证码",
    text: `你的 GenLink 注册验证码是 ${code}。验证码将在 10 分钟后失效。如果这不是你本人操作，可以忽略这封邮件。`,
    html: `
      <div style="margin:0;padding:0;background:#f6f7f9;font-family:Arial,'Microsoft YaHei','PingFang SC','Hiragino Sans GB',sans-serif;color:#111827;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f9;padding:32px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
                <tr>
                  <td style="padding:28px 28px 18px;">
                    <div style="font-size:18px;font-weight:700;letter-spacing:0;color:#111827;">GenLink</div>
                    <h1 style="margin:24px 0 8px;font-size:24px;line-height:1.25;font-weight:700;color:#111827;">验证你的邮箱</h1>
                    <p style="margin:0;font-size:15px;line-height:1.7;color:#4b5563;">请使用下面的验证码完成 GenLink 账号注册。验证码将在 10 分钟后失效。</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:8px 28px 28px;">
                    <div style="display:inline-block;padding:18px 30px;border-radius:14px;background:#111827;color:#ffffff;font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;">${code}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 28px 28px;">
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">如果这不是你本人操作，可以忽略这封邮件。</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
  };
}
