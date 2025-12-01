const prisma = require('../config/database');
const agent = require('../services/agent');
const { ok, fail } = require('../utils/response');

const createTemplate = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { userPrompet, impressionOfEmail } = req.body;
    
    if (!userPrompet || !impressionOfEmail) {
      return fail(res, 400, 'Required fields: userPrompet, impressionOfEmail');
    }

    // Generate template using agent
    const agentPrompt = `User prompt: ${userPrompet}. Email impression: ${impressionOfEmail}`;
    const agentResponse = await agent(process.env.SYSTEM_PROMPET_FOR_CREATE_TEMPLETS, [], agentPrompt);
    
    console.log("Agent template response:", agentResponse);
    
    // Parse the agent response (expecting JSON with template_en and template_ar)
    let templateData;
    try {
      const parsedResponse = JSON.parse(agentResponse);
      
      // Validate the response structure matches the expected format
      if (!parsedResponse.template_en || !parsedResponse.template_ar) {
        throw new Error('Invalid response format: missing template_en or template_ar fields');
      }
      
      templateData = {
        name: `Template ${Date.now()}`,
        content: {
          en: parsedResponse.template_en,
          ar: parsedResponse.template_ar
        },
        category: 'general',
        userPrompet: userPrompet,
        impressionOfEmail: impressionOfEmail
      };
      
    } catch (parseError) {
      console.error('Failed to parse agent response:', parseError);
      return fail(res, 400, 'Invalid template format from AI service. Expected JSON with template_en and template_ar fields.');
    }

    // Create template in database
    // const template = await prisma.templete.create({
    //   data: {
    //     name: templateData.name || `Template ${Date.now()}`,
    //     content: templateData.content || agentResponse,
    //     usedTimes: 0,
    //     categury: templateData.category || templateData.categury || 'general',
    //     isFivoret: templateData.isFivoret || false
    //   }
    // });

    return ok(res, templateData, 'Template created successfully');
  } catch (error) {
    console.error('Error creating template:', error);
    return fail(res, 500, 'Failed to create template: ' + (error?.message || ''));
  }
};

module.exports = { createTemplate };