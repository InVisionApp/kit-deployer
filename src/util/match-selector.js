"use strict";

const _ = require("lodash");
const selectorTypes = {
	equality: /^([a-zA-Z0-9]+)\s=\s([a-zA-Z0-9]+)$/,
	inequality: /^([a-zA-Z0-9]+)\s!=\s([a-zA-Z0-9]+)$/,
	setin: /^([a-zA-Z0-9]+)\sin\s\(([a-zA-Z0-9,\s]+)\)$/,
	setnotin: /^([a-zA-Z0-9]+)\snotin\s\(([a-zA-Z0-9,\s]+)\)$/,
	set: /^([a-zA-Z0-9]+)$/,
	setnot: /^!([a-zA-Z0-9]+)$/
};

// Given an object of labels, return true if it fulfils the selector requirements or false otherwise
function matchSelector(labels, selector) {
	const regex = /(([a-zA-Z0-9]+\s(=|!=|in|notin)\s(([a-zA-Z0-9]+)|\([a-zA-Z0-9,\s]+\))|[!a-zA-Z0-9]+))+/g;
	// Replace all bracket selectors with placeholder
	const selectors = (selector) ? selector.match(regex) : [];
	let matched = 0;

	_.each(selectors, (selc) => {
		let matches, options;
		let found = false;
		switch (true) {
			case selectorTypes.equality.test(selc):
				matches = selectorTypes.equality.exec(selc);
				_.each(labels, (value, label) => {
					if (label === matches[1] && value === matches[2]) {
						matched++;
					}
				});
				break;
			case selectorTypes.inequality.test(selc):
				matches = selectorTypes.inequality.exec(selc);
				found = false;
				_.each(labels, (value, label) => {
					if (label === matches[1] && value === matches[2]) {
						found = true;
					}
				});
				if (!found) {
					matched++;
				}
				break;
			case selectorTypes.setin.test(selc):
				matches = selectorTypes.setin.exec(selc);
				options = matches[2].split(",");

				// remove any whitespace
				_.each(options, (option, key) => {
					options[key] = option.trim();
				});

				_.each(labels, (value, label) => {
					if (label === matches[1] && matches[2].indexOf(value) >= 0) {
						matched++;
					}
				});
				break;
			case selectorTypes.setnotin.test(selc):
				matches = selectorTypes.setnotin.exec(selc);
				options = matches[2].split(",");

				// remove any whitespace
				_.each(options, (option, key) => {
					options[key] = option.trim();
				});

				found = false;

				_.each(labels, (value, label) => {
					if (label === matches[1] && matches[2].indexOf(value) >= 0) {
						found = true;
					}
				});

				if (!found) {
					matched++;
				}
				break;
			case selectorTypes.set.test(selc):
				matches = selectorTypes.set.exec(selc);
				_.each(labels, (value, label) => {
					if (label === matches[1]) {
						matched++;
					}
				});
				break;
			case selectorTypes.setnot.test(selc):
				matches = selectorTypes.setnot.exec(selc);
				found = false;
				_.each(labels, (value, label) => {
					if (label === matches[1]) {
						found = true;
					}
				});
				if (!found) {
					matched++;
				}
				break;
			default:
				return false;
		}
	});

	// selector is a match for labels if all selectors matched
	return (matched === selectors.length);
}

module.exports = matchSelector;
