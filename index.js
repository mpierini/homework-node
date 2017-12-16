'use strict'

const request = require('request')
const cheerio = require('cheerio')
const async = require('async')
const fs = require('fs')
const targz = require('targz')
const fsExtra = require('fs-extra')

module.exports = downloadPackages

function downloadPackages (count, callback) {
	request({
		method: 'GET',
		url: 'https://www.npmjs.com/browse/depended'
	}, function(err, response, body) {
		if (err) {
			return callback(err)
		}

		if (response.statusCode !== 200) {
			return callback(new Error('downloadPackages: unexpected statusCode: ' + response.statusCode))
		}

		const $ = cheerio.load(body)
		// traverse to html that has version data
		const pkgs = $('.package-details p .type-neutral-1').map(function(i, elem) {
			if (i < count) {
				return {
					name: $(this).attr('href').split('/')[2],
					version: $(this).text()
				}
			}
		}).get()

		// apply processing functions to each package object
		async.forEachOfSeries(pkgs, function(pkg, i, done) {
			extractTarball(pkg, done)
		}, callback)
	})
}

function requestAndWritePackage (pkg, callback) {
	// https://registry.npmjs.org/{NAME}/-/{NAME}-{VERSION}.tgz
	const url = 'https://registry.npmjs.org/' + pkg.name + '/-/' + pkg.name + '-' + pkg.version + '.tgz'

	request
		.get(url)
		.on('error', function(err) {
			return callback(err)
		})
		.pipe(fs.createWriteStream('./packages/' + pkg.name + '.tgz'))
		.on('finish', callback)
}

function extractTarball (pkg, callback) {
	const tgzPath = './packages/' + pkg.name + '.tgz'
	const calls = []

	calls.push(function(done) {
		// get compressed package
		requestAndWritePackage(pkg, done)
	})

	calls.push(function(done) {
		// un tar and gunzip file
		targz.decompress({
			src: tgzPath,
			dest: './packages/'
		}, done)
	})

	calls.push(function(done) {
		// remove `package` directory
		fsExtra.move('./packages/package', './packages/' + pkg.name, function() {
			// currently ignoring errors just to get in a workable state
			done()
		})
	})

	calls.push(function(done) {
		// remove tgz file
		fs.unlink(tgzPath, done)
	})

	async.series(calls, callback)
}
