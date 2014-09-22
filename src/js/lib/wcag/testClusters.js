quail.lib.wcag2.TestCluster = (function () {
	var defaultAssert = {
		// type: 'assert',
		// subject: '',
		// assertedBy: '',
		// mode: 'automated'
	};

	var resultPrioMap = [
		'untested', 'inapplicable', 'passed',
		'cantTell', 'failed'
	];

	/**
	 * TODO
	 * @param  {DOM element} elm 
	 * @return {Object}     RDF Pointer
	 */
	function createPointer(elm) {
		return elm;
		// return {
		// 	cssSelectorPointer: {
		// 		expression: '#foobar'
		// 	},
		// 	hashSnippet: {
		// 		metthod: 'md5',
		// 		expression: ''
		// 	}
		// };
	}

	/**
	 * Run the callback for each testcase within the array of tests
	 * @param  {array}   tests    
	 * @param  {Function} callback Given the parameters (test, testcase)
	 */
	function eachTestcase(tests, callback) {
		$.each(tests, function (i, test) {
			test.each(function () {
				callback.call(this, test, this);
			});
		});
	}

	/**
	 * Get an array of elements common to all tests provided
	 * @param  {Object} tests
	 * @return {Array}        Array of HTML elements
	 */
	function getCommonElements(tests) {
		var common = [],
		map = [];

		$.each(tests, function (i, test) {
			var elms = [];
			test.each(function () {
				elms.push(this.get('element'));
			});
			map.push(elms);
		});
		$.each(map, function (i, arr) {
			if (i === 0) {
				common = arr;
				return;
			}
			var newArr = [];
			$.each(arr, function (i, val) {
				if (common.indexOf(val) !== -1) {
					newArr.push(val);
				}
			});
			common = newArr;
		});
		return common;
	}

	/**
	 * Get an array of elements in the given tests
	 * @param  {Object} tests
	 * @return {Array}        Array of HTML elements
	 */
	function getAllElements(tests) {
		var elms = [];
		eachTestcase(tests, function (test, testCase) {
			var elm = testCase.get('element');
			if (elms.indexOf(elm) === -1) {
				elms.push(elm);
			}
		});
		return elms;
	}


	/**
	 * Look at each unique element and create an assert for it
	 * @param  {array[DOM element]} elms
	 * @param  {object} base Base object for the assert
	 * @return {array[assert]}      Array with asserts
	 */
	function createAssertForEachElement(elms, base) {
		var asserts = [];
		// Create asserts for each element
		$.each(elms, function (i, elm) {
			var assert = $.extend({}, base, defaultAssert);
			if (typeof assert.outcome === 'object') {
				assert.outcome = $.extend({}, assert.outcome);
			}
			if (elm) { // Don't do undefined pointers
				assert.outcome.pointer = createPointer(elm);
			}
			asserts.push(assert);
		});
		return asserts;
	}

	/**
	 * Return the priorty index of the result
	 * @param  {result|assert|outcome} val
	 * @return {integer}     Result index in order of prioerty
	 */
	function getResultPrio(val) {
		if (typeof val === 'object') {
			if (val.outcome) {
				val = val.outcome.result;
			} else {
				val = val.result;
			}
		}
		return resultPrioMap.indexOf(val);
	}


	/**
	 * Combine the test results of a cluster into asserts
	 * @param  {Object} cluster
	 * @param  {Array[Object]} tests
	 * @return {Array[Object]}         Array of Asserts
	 */
	function getCombinedAsserts(cluster, tests) {
		var elms = getCommonElements(tests),
		asserts = createAssertForEachElement(elms, {
			testCase: cluster.id,
			outcome: {result: 'failed'}
		});

		// Iterate over all results to build the assert
		eachTestcase(tests, function (test, testcase) {
			// Look up the assert, if any
			var newResult = testcase.get('status'),
			assert = asserts[elms.indexOf(
				testcase.get('element')
			)];

			// Allow the cluster to override the results
			if (cluster[newResult]) {
				newResult = cluster[newResult];
			}

			// Override if the resultId is higher or equal (combine)
			if (assert && getResultPrio(assert) >= getResultPrio(newResult)) {
				var pointer = assert.outcome.pointer;
				assert.outcome = {
					result: newResult,
					info: test.get('title')
				};
				if (pointer) {
					assert.outcome.pointer = pointer;
				}
			}
		});

		return asserts;
	}


	/**
	 * Stack the test results of a cluster into asserts
	 * @param  {Object} cluster
	 * @param  {Array[Object]} tests
	 * @return {Array[Object]}         Array of Asserts
	 */
	function getStackedAsserts(cluster, tests) {
		var elms = getAllElements(tests),
		asserts = createAssertForEachElement(elms, {
			testCase: cluster.id,
			outcome: { result: 'untested'}
		});

		// Iterate over all results to build the assert
		eachTestcase(tests, function (test, testcase) {
			// Look up the assert, if any
			var newResult = testcase.get('status'),
			assert = asserts[elms.indexOf(
				testcase.get('element')
			)];

			// Allow the cluster to override the results
			if (cluster[newResult]) {
				newResult = cluster[newResult];
			}

			// Override if the resultId is lower (stacked)
			if (assert && getResultPrio(assert) < getResultPrio(newResult)) {
				assert.outcome = {
					result: newResult,
					info: test.get('title')
				};
			}
		});
		return asserts;
	}


	function constructor(config, testDefinitions) {
		var cluster = $.extend({
			id: config.tests.join('+')
		}, config);

		cluster.tests = $.map(cluster.tests, function (test) {
			return testDefinitions[test];
		});

		/**
		 * Filter the data array so it only contains results 
		 * from this cluster
		 * @param  {Array} data
		 * @return {Array}
		 */
		cluster.filterDataToTests = function (data) {
			var names = $.map(cluster.tests, function (test) {
				return test.name;
			}),
			testData = [];

			$.each(data, function (i, result) {
				if (names.indexOf(result.get('name')) !== -1) {
					testData.push(result);
				}
			});
			return testData;
		};

		cluster.getResults = function (tests) {
			var asserts;
			tests = cluster.filterDataToTests(tests);

			if (tests.length === 1 || cluster.type === 'combined') {
				asserts = getCombinedAsserts(cluster, tests);

			} else if (cluster.type === "stacking") {
				asserts = getStackedAsserts(cluster, tests);

			} else if (window) {
				window.console.error(
					"Unknown type for cluster " +cluster.id
				);
			}

			// Return a default assert if none was defined
			if (asserts) {
				if (asserts.length === 0) {
					asserts.push($.extend({
						testCase: cluster.id,
						outcome: {
							result: 'inapplicable'
						}
					}, defaultAssert));
				}
				return asserts;
			}
		};

		return cluster;
	}

	return constructor;
}());