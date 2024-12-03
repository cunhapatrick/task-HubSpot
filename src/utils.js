const { disallowedValues, defaultPropertyName } = require('./contants');
/**
 * Filters out null, empty, and disallowed values from an object.
 *
 * @param {Object} object - The object to filter.
 * @returns {Object} A new object with the filtered values.
 */
const filterNullValuesFromObject = object =>
  Object
    .fromEntries(
      Object
        .entries(object)
        .filter(([_, v]) =>
          v !== null &&
          v !== '' &&
          typeof v !== 'undefined' &&
          (typeof v !== 'string' || !disallowedValues.includes(v.toLowerCase()) || !v.toLowerCase().includes('!$record'))));
    
 
/**
 * Normalizes a property name by converting it to lowercase, removing trailing and leading underscores,
 * and replacing multiple underscores with a single underscore.
 *
 * @param {string} key - The property name to normalize.
 * @returns {string} The normalized property name.
 */
const normalizePropertyName = key => key.toLowerCase().replace(/__c$/, '').replace(/^_+|_+$/g, '').replace(/_+/g, '_');

/**
 * Logs the provided actions to the console.
 *
 * @param {Array} actions - The actions to be logged.
 */
const goal = actions => {
  // this is where the data will be written to the database
  console.log(actions);
};

/**
 * Generates a filter object for the last modified date.
 *
 * @param {Date} date - The start date for the filter.
 * @param {Date} nowDate - The end date for the filter.
 * @param {string} [propertyName=defaultPropertyName] - The property name to filter by.
 * @returns {Object} The filter object for the last modified date.
 */
const generateLastModifiedDateFilter = (date, nowDate, propertyName = defaultPropertyName) => {
  const lastModifiedDateFilter = date ?
    {
      filters: [
        { propertyName, operator: 'GTE', value: `${date.valueOf()}` },
        { propertyName, operator: 'LTE', value: `${nowDate.valueOf()}` }
      ]
    } :
    {};

  return lastModifiedDateFilter;
};

/**
 * Refreshes the access token from HubSpot.
 *
 * @param {Object} domain - The domain object containing integration details.
 * @param {string} hubId - The HubSpot ID of the account.
 * @param {Date} expirationDate - The expiration date of the current access token.
 * @param {Object} hubspotClient - The hubspot client.
 * @param {number} tryCount - The number of attempts made to refresh the token.
 * @returns {Promise<boolean>} A promise that resolves to true if the token was refreshed successfully.
 */
const refreshAccessToken = async (domain, hubId, expirationDate, hubspotClient, tryCount) => {
  const { HUBSPOT_CID, HUBSPOT_CS } = process.env;
  const account = domain.integrations.hubspot.accounts.find(account => account.hubId === hubId);
  const { accessToken, refreshToken } = account;

  return hubspotClient.oauth.tokensApi
    .createToken('refresh_token', undefined, undefined, HUBSPOT_CID, HUBSPOT_CS, refreshToken)
    .then(async result => {
      const body = result.body ? result.body : result;

      const newAccessToken = body.accessToken;
      expirationDate = new Date(body.expiresIn * 1000 + new Date().getTime());

      hubspotClient.setAccessToken(newAccessToken);
      if (newAccessToken !== accessToken) {
        account.accessToken = newAccessToken;
      }

      return true;
    });
};

/**
 * Saves the domain object.
 *
 * @param {Object} domain - The domain object to save.
 * @returns {Promise<void>} A promise that resolves when the domain is saved.
 */
const saveDomain = async domain => {
  // disable this for testing purposes
  return;

};

module.exports = {
  filterNullValuesFromObject,
  normalizePropertyName,
  goal,
  generateLastModifiedDateFilter,
  refreshAccessToken,
  saveDomain,
};
