const { saveDomain, refreshAccessToken, generateLastModifiedDateFilter } = require('../utils');

/**
 * Processes meetings from HubSpot and pushes them to a queue.
 * Get recently modified meetings as 100 contacts per page
 * 
 * @param {Object} domain - The domain object containing integration details.
 * @param {string} hubId - The HubSpot account ID.
 * @param {Array} queue - The queue to push meeting actions to.
 * @param {Date} expirationDate - The expiration date for the access token.
 * @param {Object} hubspotClient - The hubspot client.
 * @returns {Promise<boolean>} - Returns true if meetings were processed successfully.
 * @throws {Error} - Throws an error if meetings cannot be fetched after multiple attempts.
 */
const processMeetings = async (domain, hubId, queue, expirationDate, hubspotClient) => {
  const account = domain.integrations.hubspot.accounts.find(account => account.hubId === hubId);
  const lastPulledDate = new Date(account.lastPulledDates.meetings);
  const now = new Date();

  let hasMore = true;
  const offsetObject = {};
  const limit = 100;

  while (hasMore) {
    const lastModifiedDate = offsetObject.lastModifiedDate || lastPulledDate;
    const lastModifiedDateFilter = generateLastModifiedDateFilter(lastModifiedDate, now, 'hs_lastmodifieddate');
    const searchObject = {
      filterGroups: [lastModifiedDateFilter],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' }],
      properties: [
        'hs_meeting_title',
        'hs_meeting_start_time',
        'hs_meeting_end_time'
      ],
      limit,
      after: offsetObject.after
    };

    let searchResult = {};

    let tryCount = 0;
    while (tryCount <= 4) {
      try {
        searchResult = await hubspotClient.crm.objects.searchApi.doSearch('meetings', searchObject);
        break;
      } catch (err) {
        tryCount++;

        if (new Date() > expirationDate) await refreshAccessToken(domain, hubId);

        await new Promise(resolve => setTimeout(resolve, 5000 * Math.pow(2, tryCount)));
      }
    }

    if (!searchResult) throw new Error('Failed to fetch meetings for the 4th time. Aborting.');

    const data = searchResult.results || [];

    console.log('fetch meeting batch');

    offsetObject.after = parseInt(searchResult.paging?.next?.after);

    for (const meeting of data) {
      if (!meeting.properties) continue;

      const isCreated = new Date(meeting.createdAt) > lastPulledDate;

      const actionTemplate = {
        includeInAnalytics: 0,
        meetingProperties: {
          meeting_id: meeting.id,
          meeting_title: meeting.properties.hs_meeting_title,
          meeting_start: meeting.properties.hs_meeting_start_time,
          meeting_end: meeting.properties.hs_meeting_end_time
        }
      };

      const participants = await getMeetingParticipants(meeting.id);

      queue.push({
        actionName: isCreated ? 'Meeting Created' : 'Meeting Updated',
        actionDate: new Date(isCreated ? meeting.createdAt : meeting.updatedAt),
        participants,
        ...actionTemplate
      });
    }

    if (!offsetObject?.after) {
      hasMore = false;
      break;
    } else if (offsetObject?.after >= 9900) {
      offsetObject.after = 0;
      offsetObject.lastModifiedDate = new Date(data[data.length - 1].updatedAt).valueOf();
    }
  }

  account.lastPulledDates.meetings = now;
  await saveDomain(domain);

  return true;
};

/**
 * Retrieves the participants of a meeting.
 *
 * @param {string} meetingId - The ID of the meeting.
 * @param {Object} hubspotClient - The HubSpot client.
 * @returns {Promise<Array<string>>} - A promise that resolves to an array of participant email addresses.
 */
const getMeetingParticipants = async (meetingId, hubspotClient) => {
  const response = await hubspotClient.crm.associations.batchApi.read({
    inputs: [{ id: meetingId }],
    fromObjectType: 'meetings',
    toObjectType: 'contacts'
  });

  const participants = response.results.map(association => association.toObjectId);
  
  const contactDetails = await hubspotClient.crm.contacts.batchApi.read({
    inputs: participants.map(contactId => ({ id: contactId }))
  });

  return contactDetails.results.map(contact => contact.properties.email);
};

module.exports = processMeetings;