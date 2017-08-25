"use strict";

function convertStringToArray(string) {
  let array = [];
  try {
    array = JSON.parse(string);
  } catch (err) {
    // Assume is just a string (single url)
    if (string) {
      array = [string];
    }
  }
  return array;
}

module.exports = convertStringToArray;
