/**
 * Tag/attribute/class applier module for Rangy.
 *
 * Depends on Rangy core.
 *
 * Subject the Raptor licence: http://www.raptor-editor.com/license
 * @author Tim Down
 * @author David Neilsen david@panmedia.co.nz
 *
 * Derived from "CSS Class Applier module for Rangy." which is Copyright 2012,
 * Tim Down, and licensed under the MIT license.
 */
rangy.createModule("Applier", ["WrappedSelection"], function(api, module) {
    var dom = api.dom;
    var DomPosition = dom.DomPosition;

    function trim(str) {
        return str.replace(/^\s\s*/, "").replace(/\s\s*$/, "");
    }

    function hasClass(el, cssClass) {
        return el.className && new RegExp("(?:^|\\s)" + cssClass + "(?:\\s|$)").test(el.className);
    }

    function addClass(el, cssClass) {
        if (el.className) {
            if (!hasClass(el, cssClass)) {
                el.className += " " + cssClass;
            }
        } else {
            el.className = cssClass;
        }
    }

    var removeClass = (function() {
        function replacer(matched, whiteSpaceBefore, whiteSpaceAfter) {
            return (whiteSpaceBefore && whiteSpaceAfter) ? " " : "";
        }

        return function(el, cssClass) {
            if (el.className) {
                el.className = el.className.replace(new RegExp("(^|\\s)" + cssClass + "(\\s|$)"), replacer);
            }
        };
    })();

    function sortClassName(className) {
        return className.split(/\s+/).sort().join(" ");
    }

    function getSortedClassName(el) {
        return sortClassName(el.className);
    }

    function haveSameClasses(el1, el2) {
        return getSortedClassName(el1) == getSortedClassName(el2);
    }

    function compareRanges(r1, r2) {
        return r1.compareBoundaryPoints(r2.START_TO_START, r2);
    }

    function mergeOverlappingRanges(ranges) {

        for (var i = 0, len = ranges.length, r1, r2, j; i < len; ++i) {
        }
    }

    // Sorts and merges any overlapping ranges
    function normalizeRanges(ranges) {
        var sortedRanges = ranges.slice(0);
        sortedRanges.sort(compareRanges);
        var newRanges = [];

        // Check for overlaps and merge where they exist
        for (var i = 1, len = ranges.length, range, mergedRange = ranges[0]; i < len; ++i) {
            range = ranges[i];
            if (range.intersectsOrTouchesRange(mergedRange)) {
                mergedRange = mergedRange.union(range);
            } else {
                newRanges.push(mergedRange);
                mergedRange = range;
            }

        }
        newRanges.push(mergedRange);
        return newRanges;
    }

    function movePosition(position, oldParent, oldIndex, newParent, newIndex) {
        var node = position.node, offset = position.offset;

        var newNode = node, newOffset = offset;

        if (node == newParent && offset > newIndex) {
            newOffset++;
        }

        if (node == oldParent && (offset == oldIndex  || offset == oldIndex + 1)) {
            newNode = newParent;
            newOffset += newIndex - oldIndex;
        }

        if (node == oldParent && offset > oldIndex + 1) {
            newOffset--;
        }

        position.node = newNode;
        position.offset = newOffset;
    }

    function movePreservingPositions(node, newParent, newIndex, positionsToPreserve) {
        // For convenience, allow newIndex to be -1 to mean "insert at the end".
        if (newIndex == -1) {
            newIndex = newParent.childNodes.length;
        }

        var oldParent = node.parentNode;
        var oldIndex = dom.getNodeIndex(node);

        for (var i = 0, position; position = positionsToPreserve[i++]; ) {
            movePosition(position, oldParent, oldIndex, newParent, newIndex);
        }

        // Now actually move the node.
        if (newParent.childNodes.length == newIndex) {
            newParent.appendChild(node);
        } else {
            newParent.insertBefore(node, newParent.childNodes[newIndex]);
        }
    }

    function moveChildrenPreservingPositions(node, newParent, newIndex, removeNode, positionsToPreserve) {
        var child, children = [];
        while ( (child = node.firstChild) ) {
            movePreservingPositions(child, newParent, newIndex++, positionsToPreserve);
            children.push(child);
        }
        if (removeNode) {
            node.parentNode.removeChild(node);
        }
        return children;
    }

    function replaceWithOwnChildrenPreservingPositions(element, positionsToPreserve) {
        return moveChildrenPreservingPositions(element, element.parentNode, dom.getNodeIndex(element), true, positionsToPreserve);
    }

    function rangeSelectsAnyText(range, textNode) {
        var textRange = range.cloneRange();
        textRange.selectNodeContents(textNode);

        var intersectionRange = textRange.intersection(range);
        var text = intersectionRange ? intersectionRange.toString() : "";
        textRange.detach();

        return text != "";
    }

    function rangeSelectsAnySelfClosing(range) {
        var clonedRange = range.cloneRange();
        return /<img/.test(fragmentToHtml(clonedRange.cloneContents()));
    }

    function getEffectiveNodes(range) {
        return range.getNodes([], function(node) {
            if (node.nodeType === 3 && rangeSelectsAnyText(range, node)) {
                return node;
            } else if (node.nodeType === 1 && node.tagName === 'IMG') {
                return node;
            }
        });
    }

    function elementsHaveSameNonClassAttributes(el1, el2) {
        if (el1.attributes.length != el2.attributes.length) return false;
        for (var i = 0, len = el1.attributes.length, attr1, attr2, name; i < len; ++i) {
            attr1 = el1.attributes[i];
            name = attr1.name;
            if (name != "class") {
                attr2 = el2.attributes.getNamedItem(name);
                if (attr1.specified != attr2.specified) return false;
                if (attr1.specified && attr1.nodeValue !== attr2.nodeValue) return false;
            }
        }
        return true;
    }

    function elementHasNonClassAttributes(el, exceptions) {
        for (var i = 0, len = el.attributes.length, attrName; i < len; ++i) {
            attrName = el.attributes[i].name;
            if ( !(exceptions && dom.arrayContains(exceptions, attrName)) && el.attributes[i].specified && attrName != "class") {
                return true;
            }
        }
        return false;
    }

    function elementHasProps(el, props) {
        var propValue;
        for (var p in props) {
            if (props.hasOwnProperty(p)) {
                propValue = props[p];
                if (typeof propValue == "object") {
                    if (!elementHasProps(el[p], propValue)) {
                        return false;
                    }
                } else if (el[p] !== propValue) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Convert a DOMFragment to an HTML string. Optionally wraps the string in a tag.
     * @todo type for domFragment and tag.
     * @param {type} domFragment The fragment to be converted to a HTML string.
     * @param {type} tag The tag that the string may be wrapped in.
     * @returns {String} The DOMFragment as a string, optionally wrapped in a tag.
     */
    function fragmentToHtml(domFragment, tag) {
        var html = '';
        // Get all nodes in the extracted content
        for (var j = 0, l = domFragment.childNodes.length; j < l; j++) {
            var node = domFragment.childNodes.item(j);
            var content = node.nodeType === Node.TEXT_NODE ? node.nodeValue : elementOuterHtml($(node));
            if (content) {
                html += content;
            }
        }
        if (tag) {
            html = $('<' + tag + '>' + html + '</' + tag + '>');
            html.find('p').wrapInner('<' + tag + '/>');
            html.find('p > *').unwrap();
            html = $('<div/>').html(html).html();
        }
        return html;
    }

    var getComputedStyleProperty;

    if (typeof window.getComputedStyle != "undefined") {
        getComputedStyleProperty = function(el, propName) {
            return dom.getWindow(el).getComputedStyle(el, null)[propName];
        };
    } else if (typeof document.documentElement.currentStyle != "undefined") {
        getComputedStyleProperty = function(el, propName) {
            return el.currentStyle[propName];
        };
    } else {
        module.fail("No means of obtaining computed style properties found");
    }

    var isEditableElement;

    (function() {
        var testEl = document.createElement("div");
        if (typeof testEl.isContentEditable == "boolean") {
            isEditableElement = function(node) {
                return node && node.nodeType == 1 && node.isContentEditable;
            };
        } else {
            isEditableElement = function(node) {
                if (!node || node.nodeType != 1 || node.contentEditable == "false") {
                    return false;
                }
                return node.contentEditable == "true" || isEditableElement(node.parentNode);
            };
        }
    })();

    function isEditingHost(node) {
        var parent;
        return node && node.nodeType == 1
            && (( (parent = node.parentNode) && parent.nodeType == 9 && parent.designMode == "on")
            || (isEditableElement(node) && !isEditableElement(node.parentNode)));
    }

    function isEditable(node) {
        return (isEditableElement(node) || (node.nodeType != 1 && isEditableElement(node.parentNode))) && !isEditingHost(node);
    }

    var inlineDisplayRegex = /^inline(-block|-table)?$/i;

    function isNonInlineElement(node) {
        return node && node.nodeType == 1 && !inlineDisplayRegex.test(getComputedStyleProperty(node, "display"));
    }

    // White space characters as defined by HTML 4 (http://www.w3.org/TR/html401/struct/text.html)
    var htmlNonWhiteSpaceRegex = /[^\r\n\t\f \u200B]/;

    function isUnrenderedWhiteSpaceNode(node) {
        if (node.data.length == 0) {
            return true;
        }
        if (htmlNonWhiteSpaceRegex.test(node.data)) {
            return false;
        }
        var cssWhiteSpace = getComputedStyleProperty(node.parentNode, "whiteSpace");
        switch (cssWhiteSpace) {
            case "pre":
            case "pre-wrap":
            case "-moz-pre-wrap":
                return false;
            case "pre-line":
                if (/[\r\n]/.test(node.data)) {
                    return false;
                }
        }

        // We now have a whitespace-only text node that may be rendered depending on its context. If it is adjacent to a
        // non-inline element, it will not be rendered. This seems to be a good enough definition.
        return isNonInlineElement(node.previousSibling) || isNonInlineElement(node.nextSibling);
    }

    function getRangeBoundaries(ranges) {
        var positions = [], i, range;
        for (i = 0; range = ranges[i++]; ) {
            positions.push(
                new DomPosition(range.startContainer, range.startOffset),
                new DomPosition(range.endContainer, range.endOffset)
            );
        }
        return positions;
    }

    function updateRangesFromBoundaries(ranges, positions) {
        for (var i = 0, range, start, end, len = ranges.length; i < len; ++i) {
            range = ranges[i];
            start = positions[i * 2];
            end = positions[i * 2 + 1];
            range.setStartAndEnd(start.node, start.offset, end.node, end.offset);
        }
    }

    function arrayWithoutValue(arr, val) {
        var newArray = [];
        for (var i = 0, len = arr.length; i < len; ++i) {
            if (arr[i] !== val) {
                newArray.push(arr[i]);
            }
        }
        return newArray;
    }

    function isSplitPoint(node, offset) {
        if (dom.isCharacterDataNode(node)) {
            if (offset == 0) {
                return !!node.previousSibling;
            } else if (offset == node.length) {
                return !!node.nextSibling;
            } else {
                return true;
            }
        }

        return offset > 0 && offset < node.childNodes.length;
    }

    function splitNodeAt(node, descendantNode, descendantOffset, positionsToPreserve) {
        var newNode, parentNode;
        var splitAtStart = (descendantOffset == 0);

        if (dom.isAncestorOf(descendantNode, node)) {
            return node;
        }

        if (dom.isCharacterDataNode(descendantNode)) {
            var descendantIndex = dom.getNodeIndex(descendantNode);
            if (descendantOffset == 0) {
                descendantOffset = descendantIndex;
            } else if (descendantOffset == descendantNode.length) {
                descendantOffset = descendantIndex + 1;
            } else {
                throw module.createError("splitNodeAt() should not be called with offset in the middle of a data node ("
                    + descendantOffset + " in " + descendantNode.data);
            }
            descendantNode = descendantNode.parentNode;
        }

        if (isSplitPoint(descendantNode, descendantOffset)) {
            // descendantNode is now guaranteed not to be a text or other character node
            newNode = descendantNode.cloneNode(false);
            parentNode = descendantNode.parentNode;
            if (newNode.id) {
                newNode.removeAttribute("id");
            }
            var child, newChildIndex = 0;

            while ( (child = descendantNode.childNodes[descendantOffset]) ) {
                movePreservingPositions(child, newNode, newChildIndex++, positionsToPreserve);
                //newNode.appendChild(child);
            }
            movePreservingPositions(newNode, parentNode, dom.getNodeIndex(descendantNode) + 1, positionsToPreserve);
            //dom.insertAfter(newNode, descendantNode);
            return (descendantNode == node) ? newNode : splitNodeAt(node, parentNode, dom.getNodeIndex(newNode), positionsToPreserve);
        } else if (node != descendantNode) {
            newNode = descendantNode.parentNode;

            // Work out a new split point in the parent node
            var newNodeIndex = dom.getNodeIndex(descendantNode);

            if (!splitAtStart) {
                newNodeIndex++;
            }
            return splitNodeAt(node, newNode, newNodeIndex, positionsToPreserve);
        }
        return node;
    }

    function areElementsMergeable(el1, el2) {
        return el1.tagName == el2.tagName
            && haveSameClasses(el1, el2)
            && elementsHaveSameNonClassAttributes(el1, el2)
            && getComputedStyleProperty(el1, "display") == "inline"
            && getComputedStyleProperty(el2, "display") == "inline";
    }

    function createAdjacentMergeableTextNodeGetter(forward) {
        var propName = forward ? "nextSibling" : "previousSibling";

        return function(textNode, checkParentElement) {
            var el = textNode.parentNode;
            var adjacentNode = textNode[propName];
            if (adjacentNode) {
                // Can merge if the node's previous/next sibling is a text node
                if (adjacentNode && adjacentNode.nodeType == 3) {
                    return adjacentNode;
                }
            } else if (checkParentElement) {
                // Compare text node parent element with its sibling
                adjacentNode = el[propName];
                if (adjacentNode && adjacentNode.nodeType == 1 && areElementsMergeable(el, adjacentNode)) {
                    return adjacentNode[forward ? "firstChild" : "lastChild"];
                }
            }
            return null;
        };
    }

    var getPreviousMergeableTextNode = createAdjacentMergeableTextNodeGetter(false),
        getNextMergeableTextNode = createAdjacentMergeableTextNodeGetter(true);


    function Merge(firstNode) {
        this.isElementMerge = (firstNode.nodeType == 1);
        this.firstTextNode = this.isElementMerge ? firstNode.lastChild : firstNode;
        this.textNodes = [this.firstTextNode];
    }

    Merge.prototype = {
        doMerge: function(positionsToPreserve) {
            var textBits = [], combinedTextLength = 0, textNode, parent, text;
            for (var i = 0, len = this.textNodes.length, j, position; i < len; ++i) {
                textNode = this.textNodes[i];
                parent = textNode.parentNode;
                if (i > 0) {
                    parent.removeChild(textNode);
                    if (!parent.hasChildNodes()) {
                        parent.parentNode.removeChild(parent);
                    }
                    if (positionsToPreserve) {
                        for (j = 0; position = positionsToPreserve[j++]; ) {
                            // Handle case where position is inside the text node being merged into a preceding node
                            if (position.node == textNode) {
                                position.node = this.firstTextNode;
                                position.offset += combinedTextLength;
                            }
                        }
                    }
                }
                textBits[i] = textNode.data;
                combinedTextLength += textNode.data.length;
            }
            this.firstTextNode.data = text = textBits.join("");
            return text;
        },

        getLength: function() {
            var i = this.textNodes.length, len = 0;
            while (i--) {
                len += this.textNodes[i].length;
            }
            return len;
        },

        toString: function() {
            var textBits = [];
            for (var i = 0, len = this.textNodes.length; i < len; ++i) {
                textBits[i] = "'" + this.textNodes[i].data + "'";
            }
            return "[Merge(" + textBits.join(",") + ")]";
        }
    };

    // TODO: Populate this with every attribute name that corresponds to a property with a different name
    var attrNamesForProperties = {};

    function Applier(options) {
        this.tag = null;
        this.tags = [];
        this.classes = [];
        this.attributes = [];
        this.ignoreWhiteSpace = true;
        this.applyToEditableOnly = false;
        this.useExistingElements = true;
        this.ignoreClasses = false;
        this.ignoreAttributes = false;

        for (var key in options) {
            this[key] = options[key];
        }

        // Uppercase tag names
        for (var i = 0, l = this.tags.length; i < l; i++) {
            this.tags[i] = this.tags[i].toUpperCase();
        }
        if (this.tag) {
            this.tag = this.tag.toUpperCase();
            this.tags.push(this.tag);
        }
    }

    Applier.prototype = {
        copyPropertiesToElement: function(props, el, createCopy) {
            var s, elStyle, elProps = {}, elPropsStyle, propValue, elPropValue, attrName;

            for (var p in props) {
                if (props.hasOwnProperty(p)) {
                    propValue = props[p];
                    elPropValue = el[p];

                    // Special case for class. The copied properties object has the applier's CSS class as well as its
                    // own to simplify checks when removing styling elements
                    if (p == "className") {
                        addClass(el, propValue);
                        addClass(el, this.cssClass);
                        el[p] = sortClassName(el[p]);
                        if (createCopy) {
                            elProps[p] = el[p];
                        }
                    }

                    // Special case for style
                    else if (p == "style") {
                        elStyle = elPropValue;
                        if (createCopy) {
                            elProps[p] = elPropsStyle = {};
                        }
                        for (s in props[p]) {
                            elStyle[s] = propValue[s];
                            if (createCopy) {
                                elPropsStyle[s] = elStyle[s];
                            }
                        }
                        this.attrExceptions.push(p);
                    } else {
                        el[p] = propValue;
                        // Copy the property back from the dummy element so that later comparisons to check whether elements
                        // may be removed are checking against the right value. For example, the href property of an element
                        // returns a fully qualified URL even if it was previously assigned a relative URL.
                        if (createCopy) {
                            elProps[p] = el[p];

                            // Not all properties map to identically named attributes
                            attrName = attrNamesForProperties.hasOwnProperty(p) ? attrNamesForProperties[p] : p;
                            this.attrExceptions.push(attrName);
                        }
                    }
                }
            }

            return createCopy ? elProps : "";
        },

        isValid: function(node) {
            return this.isValidTag(node)
                && this.hasClasses(node)
                && this.hasAttributes(node);
        },

        isValidTag: function(node) {
            // Only elements are valid
            if (node.nodeType !== 1) {
                return false;
            }

            // Check if tag names are ignored
            if (this.tags.length === 0) {
                return true;
            }

            // Check for valid tag name
            for (var i = 0, l = this.tags.length; i < l; i++) {
                if (node.tagName === this.tags[i]) {
                    return true;
                }
            }
            return false;
        },

        hasClasses: function(node) {
            if (this.ignoreClasses) {
                return true;
            }
            for (var i = 0, l = this.classes.length; i < l; i++) {
                if (!hasClass(node, this.classes[i])) {
                    return false;
                }
            }
            return true;
        },

        hasAttributes: function(node) {
            if (this.ignoreAttributes) {
                return true;
            }
            for (var key in this.attributes) {
                if (!node.hasAttribute(key)) {
                    return false;
                }
            }
            return true;
        },

        getSelfOrAncestor: function(node) {
            while (node) {
                if (this.isValid(node)) {
                    return node;
                }
                node = node.parentNode;
            }
            return null;
        },

        isModifiable: function(node) {
            return !this.applyToEditableOnly || isEditable(node);
        },

        // White space adjacent to an unwrappable node can be ignored for wrapping
        isIgnorableWhiteSpaceNode: function(node) {
            return this.ignoreWhiteSpace && node && node.nodeType == 3 && isUnrenderedWhiteSpaceNode(node);
        },

        // Normalizes nodes after applying a CSS class to a Range.
        postApply: function(textNodes, range, positionsToPreserve, isUndo) {
            var firstNode = textNodes[0], lastNode = textNodes[textNodes.length - 1];
            var merges = [], currentMerge;

            var rangeStartNode = firstNode, rangeEndNode = lastNode;
            var rangeStartOffset = 0, rangeEndOffset = lastNode.length;

            var textNode, precedingTextNode;

            // Check for every required merge and create a Merge object for each
            for (var i = 0, len = textNodes.length; i < len; ++i) {
                textNode = textNodes[i];
                precedingTextNode = getPreviousMergeableTextNode(textNode, !isUndo);
                if (precedingTextNode) {
                    if (!currentMerge) {
                        currentMerge = new Merge(precedingTextNode);
                        merges.push(currentMerge);
                    }
                    currentMerge.textNodes.push(textNode);
                    if (textNode === firstNode) {
                        rangeStartNode = currentMerge.firstTextNode;
                        rangeStartOffset = rangeStartNode.length;
                    }
                    if (textNode === lastNode) {
                        rangeEndNode = currentMerge.firstTextNode;
                        rangeEndOffset = currentMerge.getLength();
                    }
                } else {
                    currentMerge = null;
                }
            }

            // Test whether the first node after the range needs merging
            var nextTextNode = getNextMergeableTextNode(lastNode, !isUndo);

            if (nextTextNode) {
                if (!currentMerge) {
                    currentMerge = new Merge(lastNode);
                    merges.push(currentMerge);
                }
                currentMerge.textNodes.push(nextTextNode);
            }

            // Apply the merges
            if (merges.length) {
                for (i = 0, len = merges.length; i < len; ++i) {
                    merges[i].doMerge(positionsToPreserve);
                }

                // Set the range boundaries
                range.setStartAndEnd(rangeStartNode, rangeStartOffset, rangeEndNode, rangeEndOffset);
            }
        },

        createContainer: function(doc) {
            var element = doc.createElement(this.tag);
            this.addClasses(element);
            this.addAttributes(element);
            return element;
        },

        addClasses: function(node) {
            for (var i = 0, l = this.classes.length; i < l; i++) {
                addClass(node, this.classes[i]);
            }
        },

        addAttributes: function(node) {
            for (var key in this.attributes) {
                node.setAttribute(key, this.attributes[key]);
            }
        },

        removeClasses: function(node) {
            for (var i = 0, l = this.classes.length; i < l; i++) {
                removeClass(node, this.classes[i]);
            }
        },

        removeAttributes: function(node) {
            for (var key in this.attributes) {
                node.removeAttribute(key);
            }
        },

        applyToTextNode: function(textNode, positionsToPreserve) {
            var parent = textNode.parentNode;
            if (parent.childNodes.length == 1
                    && dom.arrayContains(this.tags, parent.tagName)
                    && this.useExistingElements) {
                this.addClasses(parent);
                this.addAttributes(parent);
            } else {
                var element = this.createContainer(dom.getDocument(textNode));
                textNode.parentNode.insertBefore(element, textNode);
                element.appendChild(textNode);
            }
        },

        isRemovable: function(node) {
            return this.tags.length > 0
                && this.isValidTag(node)
                && this.hasClasses(node)
                && this.hasAttributes(node)
                && this.isModifiable(node);
        },

        undoToTextNode: function(textNode, range, ancestor, positionsToPreserve) {
            if (!range.containsNode(ancestor)) {
                // Split out the portion of the ancestor from which we can remove the CSS class
                //var parent = ancestorWithClass.parentNode, index = dom.getNodeIndex(ancestorWithClass);
                var ancestorRange = range.cloneRange();
                ancestorRange.selectNode(ancestor);
                if (ancestorRange.isPointInRange(range.endContainer, range.endOffset)) {
                    splitNodeAt(ancestor, range.endContainer, range.endOffset, positionsToPreserve);
                    range.setEndAfter(ancestor);
                }
                if (ancestorRange.isPointInRange(range.startContainer, range.startOffset)) {
                    ancestor = splitNodeAt(ancestor, range.startContainer, range.startOffset, positionsToPreserve);
                }
            }
            if (this.isRemovable(ancestor)) {
                replaceWithOwnChildrenPreservingPositions(ancestor, positionsToPreserve);
            } else {
                this.removeClasses(ancestor);
                this.removeAttributes(ancestor);
            }
        },

        applyToRange: function(range, rangesToPreserve) {
            rangesToPreserve = rangesToPreserve || [];

            // Create an array of range boundaries to preserve
            var positionsToPreserve = getRangeBoundaries(rangesToPreserve || []);

            range.splitBoundariesPreservingPositions(positionsToPreserve);
            var nodes = getEffectiveNodes(range);
            if (nodes.length) {
                for (var i = 0, textNode; textNode = nodes[i++]; ) {
                    if (!this.isIgnorableWhiteSpaceNode(textNode)
                            && this.isModifiable(textNode)) {
                        this.applyToTextNode(textNode, positionsToPreserve);
                    }
                }
                range.setStart(nodes[0], 0);
                textNode = nodes[nodes.length - 1];
                range.setEnd(textNode, textNode.length);
                if (this.normalize) {
                    this.postApply(nodes, range, positionsToPreserve, false);
                }

                // Update the ranges from the preserved boundary positions
                updateRangesFromBoundaries(rangesToPreserve, positionsToPreserve);
            }
        },

        applyToRanges: function(ranges) {
            var i = ranges.length;
            while (i--) {
                this.applyToRange(ranges[i], ranges);
            }
            return ranges;
        },

        applyToSelection: function(win) {
            var sel = api.getSelection(win);
            sel.setRanges( this.applyToRanges(sel.getAllRanges()) );
        },

        undoToRange: function(range, rangesToPreserve) {
            // Create an array of range boundaries to preserve
            rangesToPreserve = rangesToPreserve || [];
            var positionsToPreserve = getRangeBoundaries(rangesToPreserve);

            range.splitBoundariesPreservingPositions(positionsToPreserve);
            var textNodes = getEffectiveNodes(range);
            var textNode, validAncestor;
            var lastTextNode = textNodes[textNodes.length - 1];

            if (textNodes.length) {
                for (var i = 0, l = textNodes.length; i < l; ++i) {
                    textNode = textNodes[i];
                    validAncestor = this.getSelfOrAncestor(textNode);
                    if (validAncestor
                            && this.isModifiable(textNode)) {
                        this.undoToTextNode(textNode, range, validAncestor, positionsToPreserve);
                    }

                    // Ensure the range is still valid
                    range.setStart(textNodes[0], 0);
                    range.setEnd(lastTextNode, lastTextNode.length);
                }


                if (this.normalize) {
                    this.postApply(textNodes, range, positionsToPreserve, true);
                }

                // Update the ranges from the preserved boundary positions
                updateRangesFromBoundaries(rangesToPreserve, positionsToPreserve);
            }
        },

        undoToRanges: function(ranges) {
            // Get ranges returned in document order
            var i = ranges.length;

            while (i--) {
                //this.undoToRange(ranges[i], arrayWithoutValue(ranges, ranges[i]));
                this.undoToRange(ranges[i], ranges);
            }

            return ranges;
        },

        undoToSelection: function(win) {
            var sel = api.getSelection(win);
            var ranges = api.getSelection(win).getAllRanges();
            this.undoToRanges(ranges);
            sel.setRanges(ranges);
        },

        getTextSelectedByRange: function(textNode, range) {
            var textRange = range.cloneRange();
            textRange.selectNodeContents(textNode);

            var intersectionRange = textRange.intersection(range);
            var text = intersectionRange ? intersectionRange.toString() : "";
            textRange.detach();

            return text;
        },

        isAppliedToRange: function(range) {
            if (range.collapsed) {
                return !!this.getSelfOrAncestor(range.commonAncestorContainer);
            } else {
                var textNodes = range.getNodes( [3] );
                for (var i = 0, textNode; textNode = textNodes[i++]; ) {
                    if (!this.isIgnorableWhiteSpaceNode(textNode)) {
                        if (rangeSelectsAnyText(range, textNode)
                                && this.isModifiable(textNode)
                                && !this.getSelfOrAncestor(textNode)) {
                            return false;
                        } else if (rangeSelectsAnySelfClosing(range)) {
                            return false;
                        }
                    }
                }
                var html = fragmentToHtml(range.cloneContents());
                if (html.match(/^<(img)/) || trim(html.replace(/<.*?>/g, '')) === '') {
                    return false;
                }
                return true;
            }
        },

        isAppliedToRanges: function(ranges) {
            var i = ranges.length;
            if (i === 0) {
                return false;
            }
            while (i--) {
                if (!this.isAppliedToRange(ranges[i])) {
                    return false;
                }
            }
            return true;
        },

        isAppliedToSelection: function(win) {
            var sel = api.getSelection(win);
            return this.isAppliedToRanges(sel.getAllRanges());
        },

        toggleRange: function(range) {
            if (this.isAppliedToRange(range)) {
                this.undoToRange(range);
            } else {
                this.applyToRange(range);
            }
        },

        toggleRanges: function(ranges) {
            if (this.isAppliedToRanges(ranges)) {
                this.undoToRanges(ranges);
            } else {
                this.applyToRanges(ranges);
            }
        },

        toggleSelection: function(win) {
            if (this.isAppliedToSelection(win)) {
                this.undoToSelection(win);
            } else {
                this.applyToSelection(win);
            }
        },

        detach: function() {}
    };

    function createApplier(options) {
        return new Applier(options);
    }

    Applier.util = {
    };

    api.Applier = Applier;
    api.createApplier = createApplier;
});
