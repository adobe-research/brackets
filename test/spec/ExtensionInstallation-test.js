/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */


/*jslint vars: true, plusplus: true, devel: true, browser: true, nomen: true,
indent: 4, maxerr: 50 */
/*global define, describe, it, xit, expect, beforeEach, afterEach, waits,
waitsFor, runs, $, brackets, waitsForDone */

define(function (require, exports, module) {
    "use strict";
    
    var SpecRunnerUtils  = require("spec/SpecRunnerUtils"),
        ExtensionLoader  = require("utils/ExtensionLoader"),
        NativeFileSystem = require("file/NativeFileSystem").NativeFileSystem,
        Package          = require("extensibility/Package");
    
    var testFilePath = SpecRunnerUtils.getTestPath("/spec/extension-test-files");
    
    var tempDirectory = SpecRunnerUtils.getTempDirectory();
    var extensionsRoot = tempDirectory + "/extensions";
    
    var basicValid          = testFilePath + "/basic-valid-extension.zip",
        missingNameVersion  = testFilePath + "/missing-name-version.zip",
        incompatibleVersion = testFilePath + "/incompatible-version.zip";
    
    var packageData;
    
    function handlePackage(packagePath, packageFunc) {
        var promise;
        
        packageData = undefined;
        
        runs(function () {
            promise = packageFunc(packagePath);
            promise.then(function (pd) {
                // perform checks outside of this function to avoid
                // getting caught by NodeConnection's error catcher
                packageData = pd;
            }, function (err) {
                expect("Error").toEqual("No error");
            });
            
            waitsForDone(promise, "package validation", 5000);
        });
    }
    
    function validatePackage(packagePath) {
        handlePackage(packagePath, Package.validate);
    }
    
    function installPackage(packagePath) {
        handlePackage(packagePath, Package.install);
    }
    
    describe("Extension Installation", function () {
        it("should return information about a valid file", function () {
            validatePackage(basicValid);
            
            runs(function () {
                expect(packageData.errors.length).toEqual(0);
                expect(packageData.metadata.name).toEqual("basic-valid-extension");
                expect(packageData.metadata.title).toEqual("Basic Valid Extension");
                expect(packageData.metadata.version).toEqual("1.0.0");
            });
        });
        
        it("should detect missing metadata", function () {
            validatePackage(missingNameVersion);
            
            runs(function () {
                expect(packageData.errors.length).toEqual(2);
                expect(packageData.errors[0][0]).toEqual("MISSING_PACKAGE_NAME");
                expect(packageData.errors[1][0]).toEqual("MISSING_PACKAGE_VERSION");
            });
        });
        
        
        // The code that follows mocks out the bits of ExtensionLoader that are
        // used during installation so that the extension is not *actually*
        // loaded after it's installed.
        var realGetUserExtensionPath, realLoadExtension, lastExtensionLoad;
        
        function mockGetUserExtensionPath() {
            return extensionsRoot + "/user";
        }
        
        function mockLoadExtension(name, config, entryPoint) {
            var d = $.Deferred();
            lastExtensionLoad.name = name;
            lastExtensionLoad.config = config;
            lastExtensionLoad.entryPoint = entryPoint;
            d.resolve();
            return d.promise();
        }
        
        beforeEach(function () {
            realGetUserExtensionPath = ExtensionLoader.getUserExtensionPath;
            ExtensionLoader.getUserExtensionPath = mockGetUserExtensionPath;
            
            lastExtensionLoad = {};
            realLoadExtension = ExtensionLoader.loadExtension;
            ExtensionLoader.loadExtension = mockLoadExtension;
        });
        
        afterEach(function () {
            ExtensionLoader.getUserExtensionPath = realGetUserExtensionPath;
            ExtensionLoader.loadExtension = realLoadExtension;
            var promise = SpecRunnerUtils.remove(mockGetUserExtensionPath());
            waitsForDone(promise, "Mock Extension Removal", 2000);
        });
        
        it("extensions should install and load", function () {
            installPackage(basicValid);
            
            var mainCheckComplete = false;
            
            runs(function () {
                expect(packageData.errors.length).toEqual(0);
                expect(packageData.name).toEqual("basic-valid-extension");
                
                // confirm that the extension would have been loaded had we not
                // mocked the loading part
                expect(lastExtensionLoad.name).toEqual("basic-valid-extension");
                var expectedPath = mockGetUserExtensionPath() + "/basic-valid-extension";
                if (brackets.platform === "win") {
                    expectedPath = expectedPath.replace(/\//g, "\\");
                }
                expect(lastExtensionLoad.config.baseUrl).toEqual(expectedPath);
                expect(lastExtensionLoad.entryPoint).toEqual("main");
                NativeFileSystem.resolveNativeFileSystemPath(extensionsRoot + "/user/basic-valid-extension/main.js",
                    function () {
                        mainCheckComplete = true;
                    },
                    function () {
                        mainCheckComplete = true;
                        expect("basic-valid-extension directory and main.js to exist").toEqual(true);
                    });
            });
            
            waitsFor(function () { return mainCheckComplete; }, 1000, "checking for main.js file");
        });
        
        it("extensions should install disabled if they are not compatible", function () {
            installPackage(incompatibleVersion);
            
            var directoryCheckComplete = false;

            runs(function () {
                expect(packageData.errors.length).toEqual(0);
                expect(packageData.disabledReason).not.toBeNull();
                expect(packageData.name).toEqual("incompatible-version");
                expect(lastExtensionLoad).toEqual({});
                NativeFileSystem.resolveNativeFileSystemPath(extensionsRoot + "/disabled/incompatible-version",
                    function () {
                        directoryCheckComplete = true;
                    },
                    function () {
                        directoryCheckComplete = true;
                        expect("incompatible-version path to exist in the disabled directory").toEqual(true);
                    });

                waitsFor(function () { return directoryCheckComplete; }, 1000, "checking for disabled extension directory");
                
            });
        });
    });
});