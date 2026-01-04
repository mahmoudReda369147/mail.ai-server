const prisma = require('../config/database');
const { getNewMessages, getSenderEmail, isFromSpecificEmail, getMessageDetails, sendAutoReply } = require('../services/gmailPubSub');
const { getSmartInboxAnalysis, analyzeActionItems, generateAutoReply } = require('../services/aiAgents');
const { createMeetingEvent } = require('../services/calendarService');

/**
 * Handle Gmail push notification webhook from Google Cloud Pub/Sub
 * This endpoint receives notifications when new emails arrive
 */
const handleGmailWebhook = async (req, res) => {
    try {
        // Acknowledge receipt immediately (Google requires 200 response within 30 seconds)
        res.status(200).json({ message: 'Webhook received' });

        // Decode the Pub/Sub message
        const pubsubMessage = req.body.message;
        if (!pubsubMessage || !pubsubMessage.data) {
            console.log('Invalid Pub/Sub message format');
            return;
        }

        // Decode base64 data
        const decodedData = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
        const data = JSON.parse(decodedData);

        console.log('Gmail notification received:', {
            emailAddress: data.emailAddress,
            historyId: data.historyId
        });

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email: data.emailAddress }
        });

        if (!user) {
            console.log('User not found for email:', data.emailAddress);
            return;
        }

        // Get user's last history ID (you need to store this)
        const lastHistoryId = user.gmailHistoryId || data.historyId;

        // Get new messages since last history
        const newMessages = await getNewMessages(user.id, lastHistoryId);

        console.log(`Found ${newMessages.length} new messages for user ${user.email}`);

        // Process all messages
        for (const message of newMessages) {
            const senderEmail = getSenderEmail(message);
            console.log('New message from:', senderEmail);

            // Log the message
            console.log('📧 New message received:', {
                from: senderEmail,
                message: message
            });

            const user = await prisma.user.findFirst({
                where: { email: data.emailAddress }
            });
            if (!user) {
                console.log('User not found for email:', data.emailAddress);
                continue;
            }

            const bots = await prisma.bots.findMany({
                where: {
                    userId: user.id,
                    emails: {
                        has: senderEmail
                    },
                    isactive: true
                }
            });

            console.log('Found bots:', bots);
             const fullMessage = await getMessageDetails(user.id, message.id);
             const subjectHeader = fullMessage.payload.headers.find(
                        header => header.name.toLowerCase() === 'subject'
                    );
                    const emailSubject = subjectHeader ? subjectHeader.value : '';

                    // Extract email body (text or HTML)
                    const extractBody = (payload) => {
                        let body = '';

                        if (payload.parts) {
                            for (const part of payload.parts) {
                                if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
                                    if (part.body.data) {
                                        body = Buffer.from(part.body.data, 'base64').toString('utf-8');
                                        break;
                                    }
                                }
                                // Handle nested parts
                                if (part.parts) {
                                    body = extractBody(part);
                                    if (body) break;
                                }
                            }
                        } else if (payload.body.data) {
                            body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
                        }

                        return body;
                    };
                    const emailBody = extractBody(fullMessage.payload) || fullMessage.snippet || '';

            // Check if auto-summarize is enabled for the first bot
            if (bots.length > 0 ) {
                if( bots[0].isautoSummarize === true){
                      try {
                    // Get AI summarization
                    console.log('🤖 Auto-summarizing email...');
                    const summary = await getSmartInboxAnalysis(emailBody, emailSubject);
                    console.log('📊 Email Summary:', summary);

                    // Save summary to database
                    await prisma.aiSummarys.create({
                        data: {
                            summary: summary.summary || '',
                            priority: summary.priorityScore || 50,
                            userId: user.id,
                            gmailId: message.id

                        }
                    });
                    console.log('✅ Summary saved to database');

                } catch (error) {
                    console.error('Error during auto-summarization:', error);
                }
            }
            if(bots[0].isautoExtractTaskes === true  || bots[0].isautoExtractMettengs === true){
                try {
                    console.log('📋 Auto-extracting tasks and meetings...');
                    const actionItems = await analyzeActionItems(emailBody, emailSubject);
                    console.log('📊 Extracted Action Items:', actionItems);

                    // Save tasks to database
                    if (actionItems.tasks && actionItems.tasks.length > 0 && bots[0].isautoExtractTaskes === true) {
                        for (const task of actionItems.tasks) {
                            await prisma.task.create({
                                data: {
                                    task: task.description,
                                    taskDate: task.deadline ? new Date(task.deadline) : null,
                                    priority: task.priority.toLowerCase(),
                                    userId: user.id,
                                    gmailId: message.id,
                                    isDoneTask: false,
                                    isCreatedByBot: true,
                                    botId: bots[0].id
                                }
                            });
                        }
                        console.log(`✅ ${actionItems.tasks.length} task(s) saved to database`);
                    }

                    // Save meeting to calendar tasks and Google Calendar
                    if (actionItems.meeting && bots[0].isautoExtractMettengs === true) {
                        const meeting = actionItems.meeting;

                        // Combine date and time into a DateTime
                        let meetingDateTime;
                        if (meeting.date && meeting.time) {
                            meetingDateTime = new Date(`${meeting.date}T${meeting.time}:00`);
                        } else if (meeting.date) {
                            meetingDateTime = new Date(meeting.date);
                        } else {
                            meetingDateTime = new Date();
                        }

                        // First, add the meeting to Google Calendar
                        let googleEventId = null;
                        try {
                            console.log('📅 Adding meeting to Google Calendar...');
                            const calendarEvent = await createMeetingEvent(user.id, meeting);
                            googleEventId = calendarEvent.id;
                            console.log('✅ Meeting added to Google Calendar:', calendarEvent.htmlLink);
                        } catch (calendarError) {
                            console.error('⚠️ Error adding to Google Calendar:', calendarError.message);
                            // Continue to save in database even if calendar addition fails
                        }

                        // Then save to database with the Google Calendar event ID
                        await prisma.calendarTask.create({
                            data: {
                                title: meeting.title || 'Meeting',
                                description: `${meeting.agenda || ''}\nDuration: ${meeting.duration || 'Not specified'}`,
                                dueDate: meetingDateTime,
                                status: 'pending',
                                priority: 'high',
                                userId: user.id,
                                gmailId: message.id,
                                googleEventId: googleEventId,
                                isCreatedByBot: true,
                                botId: bots[0].id
                            }
                        });
                        console.log('✅ Meeting saved to database');
                    }

                } catch (error) {
                    console.error('Error during task extraction:', error);
                }
            }

            if(bots[0].isAutoReply === true){
                try {
                    console.log('✉️ Auto-reply is enabled, generating response...');

                    // Prepare email data for AI
                    const emailData = {
                        from: senderEmail,
                        subject: emailSubject,
                        date: new Date().toISOString(),
                        body: emailBody,
                        snippet: fullMessage.snippet
                    };

                    // Generate auto-reply using AI with user's custom prompt and tone
                    const replyBody = await generateAutoReply(
                        emailData,
                        bots[0].userPrompet,
                        bots[0].replayTony,
                        bots[0].templete
                    );

                    console.log('🤖 AI-generated reply:', replyBody.substring(0, 100) + '...');

                    // Prepare reply subject (Re: original subject)
                    const replySubject = emailSubject.startsWith('Re:')
                        ? emailSubject
                        : `Re: ${emailSubject}`;

                    // Send the auto-reply
                    await sendAutoReply(
                        user.id,
                        message.id,
                        senderEmail,
                        replySubject,
                        replyBody
                    );

                    console.log('✅ Auto-reply sent successfully to:', senderEmail);

                } catch (error) {
                    console.error('Error during auto-reply:', error);
                    // Continue processing even if auto-reply fails
                }
            }
                }
                
        }

        // Update user's history ID
        await prisma.user.update({
            where: { id: user.id },
            data: { gmailHistoryId: String(data.historyId) }
        });

    } catch (error) {
        console.error('Error handling Gmail webhook:', error);
        // Don't throw error - we already sent 200 response
    }
};

module.exports = {
    handleWebhook: handleGmailWebhook,
    handleGmailWebhook
};