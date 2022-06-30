/**
 * @fileoverview Shared code for interacting with the Bill.com API.
 * For more information, check out the API documentation:
 * https://developer.bill.com/hc/en-us/articles/360035447551-API-Structure
 */

import * as airtable from './airtable.js';
import fetch from 'node-fetch';
import * as utils from './utils.js';

/** The organization ID for each Anchor Entity. */
const orgIds = new Map();
await new airtable.Base(utils.getInput('airtable-org-ids-base-id')).select(
    'Anchor Entities',
    'Org IDs',
    (r) => {
      utils.log(r.get('Department'));
      orgIds.set(r.get('Department'), r.get('Bill.com Org ID'));
    });
utils.log(orgIds.length);

/** The ID of the Bill.com API session (after successful authentication). */
export let sessionId;

/**
 * @param {string} endpoint 
 * @param {Object} headers
 * @param {string|FormData} body
 * @return {Promise<Object>} endpoint-specific response_data.
 */
export async function call(endpoint, headers, body) {
  const response =
      await fetch(
          `https://api.bill.com/api/v2/${endpoint}.json`,
          {method: 'POST', headers: headers, body: body});
  const json = await response.json();
  utils.log(endpoint, json);
  const data = json.response_data;
  if (json.response_status === 1) {
    utils.error(data.error_code, endpoint, data.error_message);
  }
  return data;
}

/**
 * @param {string} endpoint
 * @param {string} params
 * @return {Promise<Object>} endpoint-specific response_data.
 */
export function commonCall(endpoint, params) {
  return call(
      endpoint,
      {'Content-Type': 'application/x-www-form-urlencoded'},
      `devKey=${utils.getInput('bill-com-dev-key')}` +
          `&sessionId=${sessionId}&${params}`);
}

/** 
 * Login to access anchorEntity's Bill.com API and receive a session ID.
 * @param {string} anchorEntity
 */
export async function login(anchorEntity) {
  const loginResponse =
      await commonCall(
          'Login',
          `userName=${utils.getInput('bill-com-user-name')}` +
              `&password=${utils.getInput('bill-com-password')}` +
              `&orgId=${orgIds.get(anchorEntity)}`);
  sessionId = loginResponse.sessionId;
}

/** Login to access the primaryOrg's Bill.com API and receive a session ID. */
export function primaryOrgLogin() {
    return login(utils.primaryOrg);
}

/**
 * @param {string} endpoint
 * @param {Object} data
 * @return {Promise<Object>} endpoint-specific response_data.
 */
export function commonDataCall(endpoint, data) {
  return commonCall(endpoint, `data=${JSON.stringify(data)}`);
}

/**
 * @param {string} field
 * @param {string} op
 * @param {string} value
 * @return {Object} filter
 */
export function filter(field, op, value) {
  return {field: field, op: op, value: value};
}

/**
 * @param {string} entity
 * @param {Array<string>=} filters
 * @return {Promise<!Array<Object>>} entity list.
 */
export async function list(entity, filters=undefined) {
  const MAX = 999;
  let fullList = [];
  for (let start = 0; ; start += MAX) {
    const response =
        await commonDataCall(
            `List/${entity}`, {start: start, max: MAX, filters: filters});
    fullList = fullList.concat(response);
    if (response.length < MAX) break;
  }
  return fullList;
}

/**
 * @param {string} endpoint
 * @param {Array} data
 * @return {Promise<Array>}
 */
export function bulkCall(endpoint, data) {
  return utils.batch(
      (arr) => commonDataCall(`Bulk/Crud/${endpoint}`, {bulk: arr}), data, 100);
}
