const prisma = require("../config/database");
const {google} = require("googleapis");
const jwt = require('jsonwebtoken');
const oauth2Client = require("../services/googleClint");
const login =(req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      // نحتاج صلاحيات لقراءة البريد + بيانات المستخدم (الايميل والاسم)
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://mail.google.com/",
        "openid",
      ],
    });
    console.log("url",url)
    res.redirect(url);
  }


  const callback = async (req, res) => {
    try {
      const code = req.query.code;
      if (!code) return res.status(400).send("Missing code");
  
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
  
      // جلب بيانات المستخدم (الايميل والاسم)
      const oauth2 = google.oauth2("v2");
      const { data: userinfo } = await oauth2.userinfo.get({ auth: oauth2Client });
  
      const email = userinfo?.email;
      const name = userinfo?.name || userinfo?.given_name || null;
      if (!email) {
        return res
          .status(400)
          .send("تعذر الحصول على بريد المستخدم. تأكد من الصلاحيات (scopes).");
      }
  
      // حفظ/تحديث المستخدم في قاعدة البيانات باستخدام Prisma
      const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
      const user = await prisma.user.upsert({
        where: { email },
        update: {
          name,
          accessToken: tokens.access_token ?? null,
          refreshToken: tokens.refresh_token ?? null,
          tokenExpiry,
        },
        create: {
          email,
          name,
          accessToken: tokens.access_token ?? null,
          refreshToken: tokens. refresh_token ?? null,
          tokenExpiry,
        },
      });
      console.log("tokens",tokens)
  
      console.log("User upserted:", tokens);
      const serverToken = jwt.sign({ email }, process.env.JWT_SECRET);
      const redirectUrl = `http://localhost:3001/inbox?token=${encodeURIComponent(serverToken)}&status=success&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`;
      return res.redirect(302, redirectUrl);
    } catch (err) {
      console.error("OAuth callback error:", err);
      const redirectUrl = `http://localhost:3001?token=status=false`;
      return res.redirect(302, redirectUrl);
    }
  }
module.exports = {login,callback};