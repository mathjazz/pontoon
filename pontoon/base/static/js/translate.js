/* Extend public object */
var Pontoon = (function (my) {
  return $.extend(true, my, {

    /*
     * UI helper methods
     */
    getFilterType: function() {
      return $('#filter').data('current-filter') || 'all';
    },


    getFilterSearch: function() {
      return $('#search').val();
    },


    renderEntity: function (index, entity) {
      var self = this,
          status = self.getEntityStatus(entity),
          source_string = (entity.original_plural && self.locale.nplurals < 2) ? entity.marked_plural : entity.marked,
          li = $('<li class="entity limited' +
        (status ? ' ' + status : '') +
        (!entity.body ? ' uneditable' : '') +
        '" data-entry-pk="' + entity.pk + '">' +
        '<span class="status fa"></span>' +
        '<p class="string-wrapper">' +
          '<span class="source-string" data-key="' + self.doNotRender(entity.key) + '">' + source_string + '</span>' +
          '<span class="translation-string" dir="auto" lang="' + self.locale.code + '">' +
            self.doNotRender(entity.translation[0].string || '') +
          '</span>' +
        '</p>' +
        '<span class="arrow fa fa-chevron-right fa-lg"></span>' +
        '</li>', self.app.win);

      li[0].entity = entity;
      entity.ui = li; /* HTML Element representing string in the main UI */

      // Hover editable entities on the page
      if (entity.body) {
        li.hover(function () {
          self.postMessage("HOVER", entity.id);
        }, function () {
          self.postMessage("UNHOVER", entity.id);
        });
      }

      // Open entity editor on click
      li.click(function () {
        self.switchToEntity(this.entity);
      });
      return entity;
    },


    /*
     * Append entity to the appropriate section of the entity list
     */
    appendEntityToSidebar: function (entity) {
      var section = entity.body ? '.editables' : '.uneditables';
      $('#entitylist .wrapper').find(section).append(entity.ui);
    },


    /*
     * Display entity in the entity list
     *
     * Used only with in-place editor, which allows any entity to be selected
     * and thus requires them to be available in the sidebar all the time
     */
    showEntityInSidebar: function (entity) {
      $('#entitylist .entity[data-entry-pk=' + entity.pk + ']').addClass('limited').show();
    },


    /*
     * Show/hide Not on current page heading when needed
     */
    setNotOnPage: function () {
      $('#not-on-page:not(".hidden")').toggle($('.uneditables li.limited').length > 0);
    },


    /*
     * Get suggestions from other locales
     */
    getOtherLocales: function (entity) {
      var self = this,
          list = $('#helpers .other-locales ul').empty(),
          tab = $('#helpers a[href="#other-locales"]').addClass('loading'),
          count = '';

      if (self.XHRgetOtherLocales) {
        self.XHRgetOtherLocales.abort();
      }

      self.XHRgetOtherLocales = $.ajax({
        url: '/other-locales/',
        data: {
          entity: entity.pk,
          locale: self.locale.code
        },
        success: function(data) {
          if (data.length) {
            $.each(data, function() {
              list.append('<li title="Copy Into Translation (Tab)">' +
                '<header>' + this.locale__name + '<span class="stress">' + this.locale__code + '</span></header>' +
                '<p class="translation" dir="auto" lang="' + this.locale__code + '">' +
                  self.doNotRender(this.string) +
                '</p>' +
              '</li>');
            });
            count = data.length;

          } else {
            list.append('<li class="disabled"><p>No translations available.</p></li>');
          }
        },
        error: function(error) {
          if (error.status === 0 && error.statusText !== "abort") {
            // Allows requesting locales again
            editor.otherLocales = null;
            self.noConnectionError(list);
          } else {
            list.append('<li class="disabled"><p>No translations available.</p></li>');
          }
        },
        complete: function() {
          tab.removeClass('loading')
            .find('.count').html(count).toggle(count !== '');
        }
      });
    },


    /*
     * Get currently selected plural form
     *
     * normalize If true, return 0 instead of -1 for non-pluralized entities
     */
    getPluralForm: function (normalize) {
      var pluralForm = $('#plural-tabs li.active:visible').index();
      if (normalize && pluralForm === -1) {
        pluralForm = 0;
      }
      return pluralForm;
    },


    /*
     * Get history of translations of given entity
     *
     * entity Entity
     */
    getHistory: function (entity) {
      var self = this,
          list = $('#helpers .history ul').empty(),
          tab = $('#helpers a[href="#history"]').addClass('loading'),
          count = '';

      if (self.XHRgetHistory) {
        self.XHRgetHistory.abort();
      }

      self.XHRgetHistory = $.ajax({
        url: '/get-history/',
        data: {
          entity: entity.pk,
          locale: self.locale.code,
          plural_form: self.getPluralForm()
        },
        success: function(data) {
          if (data.length) {
            $.each(data, function() {
              list.append(
                '<li data-id="' + this.id + '" ' +
                (this.approved ? ' class="approved"' : '') +
                'title="Copy Into Translation (Tab)">' +
                  '<header class="clearfix' +
                    ((self.user.isTranslator) ? ' translator' :
                      ((self.user.email === this.email && !this.approved) ?
                        ' own' : '')) +
                    '">' +
                    '<div class="info">' +
                      ((!this.email) ? this.user :
                        '<a href="/contributors/' + this.email + '">' + this.user + '</a>') +
                      '<time class="stress" datetime="' + this.date_iso + '">' + this.date + '</time>' +
                    '</div>' +
                    '<menu class="toolbar">' +
                      '<button class="approve fa" title="' +
                      (this.approved ? this.approved_user ?
                        'Approved by ' + this.approved_user : '' : 'Approve') +
                      '"></button>' +
                      ((self.user.email && (self.user.email === this.email) || self.user.isTranslator) ? '<button class="delete fa" title="Delete"></button>' : '') +
                    '</menu>' +
                  '</header>' +
                  '<p class="translation" dir="auto" lang="' + self.locale.code + '">' +
                    self.doNotRender(this.translation) +
                  '</p>' +
                '</li>');
            });
            $("#helpers .history time").timeago();
            count = data.length;

          } else {
            list.append('<li class="disabled"><p>No translations available.</p></li>');
          }
        },
        error: function(error) {
          if (error.status === 0 && error.statusText !== "abort") {
            self.noConnectionError(list);
          }
        },
        complete: function() {
          tab.removeClass('loading')
            .find('.count').html(count).toggle(count !== '');
        }
      });
    },


    /*
     * Get suggestions for currently translated entity from all helpers
     */
    updateHelpers: function () {
      var entity = $('#editor')[0].entity,
          source = entity['original' + this.isPluralized()];

      this.getHistory(entity);

      // Hard to match plural forms with other locales; using singular
      this.getOtherLocales(entity);

      if (this.machinerySource !== source) {
        this.getMachinery(source);
        this.machinerySource = source;
      }

      var tab = $("#helpers nav .active a"),
          section = tab.attr('href').substr(1);

      $('#helpers section.' + section + ':hidden').show();
    },


    /*
     * Append source string metadata
     *
     * title Metadata title
     * text Metadata text
     */
    appendMetaData: function (title, text) {
      $('#metadata').append('<p><span class="title">' + title + '</span> <span class="content">' + text + '</span></p>');
    },


    /*
     * Update current translation length
     */
    updateCurrentTranslationLength: function () {
      $('#translation-length .current-length').html($('#translation').val().length);
    },


    /*
     * Update cached translation, needed for unsaved changes check
     */
    updateCachedTranslation: function () {
      this.cachedTranslation = $('#translation').val();
    },


    /*
     * Open translation editor in the main UI
     *
     * entity Entity
     * inplace Was editor opened from in place?
     */
    openEditor: function (entity, inplace) {
      var self = this;
      $("#editor")[0].entity = entity;

      // Metadata: comments, sources, keys
      $('#metadata').empty();
      if (entity.comment) {
        var comment = this.linkify(entity.comment);
        if (comment === entity.comment) {
          comment = this.doNotRender(entity.comment);
        }
        self.appendMetaData('Comment', comment);

        // Screenshots
        $('#source-pane').removeClass().find('#screenshots').empty();
        $('#metadata').find('a').each(function() {
          var url = $(this).html();
          if (/(https?:\/\/.*\.(?:png|jpg))/im.test(url)) {
            var localURL = url.replace(/en-US\//gi, self.locale.code + '/');
            $('#screenshots').append('<img src="'+ localURL +'" alt="Screenshot">');
            $('#source-pane').addClass('screenshots');
          }
        });
      }
      if (entity.key) {
        self.appendMetaData('Context', entity.key);
      }
      if (entity.source) {
        if (typeof(entity.source) === 'object') {
          $.each(entity.source, function() {
            self.appendMetaData('#:', this.join(':'));
          });
        } else {
          self.appendMetaData('Source', entity.source);
        }
      }
      if (entity.path) {
        self.appendMetaData('Resource path', entity.path);
      }

      // Translation area (must be set before unsaved changes check)
      $('#translation').val(entity.translation[0].string);
      $('.warning-overlay:visible .cancel').click();

      // Original string and plurals
      $('#original').html(entity.marked);
      $('#source-pane').removeClass('pluralized');
      $('#plural-tabs li').css('display', 'none');

      if (entity.original_plural) {
        $('#source-pane').addClass('pluralized');

        var nplurals = this.locale.nplurals;
        if (nplurals > 1) {

          // Get example number for each plural form based on locale plural rule
          if (!this.locale.examples) {
            var CLDR_PLURALS = ['zero', 'one', 'two', 'few', 'many', 'other'],
                examples = this.locale.examples = {},
                n = 0;

            if (nplurals === 2) {
              examples = {0: 1, 1: 2};

            } else {
              while (Object.keys(examples).length < nplurals) {
                var rule = eval(this.locale.plural_rule);
                if (!examples[rule]) {
                  examples[rule] = n;
                }
                n++;
              }
            }

            $.each(this.locale.cldr_plurals, function(i) {
              $('#plural-tabs li:eq(' + i + ') a')
                .find('span').html(CLDR_PLURALS[this]).end()
                .find('sup').html(examples[i]);
            });
          }
          $('#plural-tabs li:lt(' + nplurals + ')').css('display', 'table-cell');
          $('#plural-tabs li:first a').click();

        // Show plural string to locales with a single plural form (includes variable identifier)
        } else {
          $('#source-pane h2').html('Plural').show();
          $('#original').html(entity.marked_plural);
        }
      }

      self.updateHelpers();

      // Focus
      if (!inplace) {
        $('#translation').focus();
      }

      // Length
      var original = entity['original' + this.isPluralized()].length,
          translationString = entity.translation[0].string,
          translation = translationString ? translationString.length : 0;

      // Need to show if sidebar opened by default
      $('#translation-length').show().find('.original-length').html(original).end();
      self.updateCurrentTranslationLength();
      self.updateCachedTranslation();

      // Update entity list
      $("#entitylist .hovered").removeClass('hovered');
      entity.ui.addClass('hovered');
      this.updateScroll($('#entitylist .wrapper'));

      // Switch editor and entitylist in 1-column layout
      if (!this.app.advanced) {
        $("#entitylist").css('left', -$('#sidebar').width());
        $("#editor").addClass('opened').css('left', 0);
      }
    },


    /*
     * Get entity status: 'translated', 'approved', 'fuzzy', ''
     *
     * entity Entity
     */
    getEntityStatus: function (entity) {
      var translation = entity.translation,
          approved = translated = fuzzy = 0;

      for (i=0; i<translation.length; i++) {
        if (entity.translation[i].approved) {
          approved++;
        }
        if (entity.translation[i].fuzzy) {
          fuzzy++;
        }
        // Include empty and anonymous translations
        if (entity.translation[i].pk || entity.translation[i].string) {
          translated++;
        }
      }

      if (i === approved) {
        return 'approved';
      } else if (i === fuzzy) {
        return 'fuzzy';
      } else if (i === translated) {
        return 'translated';
      }
      return '';
    },


    /*
     * Check unsaved changes in editor
     *
     * callback Callback function
     */
    checkUnsavedChanges: function (callback) {
      var entity = $('#editor')[0].entity;

      // Ignore for anonymous users, for which we don't save traslations
      if (!this.user.email || !entity) {
        return callback();
      }

      var before = this.cachedTranslation,
          after = $('#translation').val();

      if ((before !== null) && (before !== after)) {
        $('#unsaved').show();
        $("#translation").focus();
        this.checkUnsavedChangesCallback = callback;

      } else {
        return callback();
      }
    },


    /*
     * Do not change anything in place and hide editor
     */
    stopInPlaceEditing: function () {
      var entity = $("#editor")[0].entity;

      if (entity.body) {
        this.postMessage("CANCEL");
        this.postMessage("UNHOVER", entity.id);
      }
    },


    /*
     * Close editor and return to entity list
     */
    goBackToEntityList: function () {
      $("#entitylist")
        .css('left', 0)
        .find('.hovered').removeClass('hovered');

      $("#editor")
        .removeClass('opened')
        .css('left', $('#sidebar').width());
    },


    /*
     * Switch to new entity in editor
     *
     * newEntity New entity we want to switch to
     */
    switchToEntity: function (newEntity) {
      var self = this;

      self.checkUnsavedChanges(function() {
        var oldEntity = $('#editor')[0].entity;

        if (newEntity.body || (oldEntity && oldEntity.body)) {
          self.postMessage("NAVIGATE", newEntity.id);
        }
        if (!newEntity.body) {
          self.openEditor(newEntity);
        }
      });
    },


    /*
     * Search list of entities using the search field value
     */
    searchEntities: function () {
      this.hasNext = true;
      if (this.requiresInplaceEditor()) {
        this.hideEntities();
      } else {
        this.cleanupEntities();
      }
      this.loadNextEntities();
    },


    /*
     * Set filter widget
     */
    setFilter: function (type) {
      var list = $("#entitylist"),
          title = $('#filter .menu li.' + type).text();

      $('#search').attr('placeholder', 'Search ' + title);
      $('#filter').data('current-filter', type)
        .find('.title').html(title).end()
        .find('.button').attr('class', 'button selector ' + type);
    },


    /*
     * Filter list of entities by given type
     */
    filterEntities: function (type) {
      this.setFilter(type);
      this.searchEntities();
    },


    /*
     * Render list of entities to translate
     */
    renderEntityList: function () {
      var self = this,
          list = $('#entitylist');

      $($(self.entities).map($.proxy(self.renderEntity, self))).each(function (idx, entity) {
        self.appendEntityToSidebar(entity);
      });

      self.setNotOnPage();
    },


    attachEntityListHandlers: function() {
      var self = this;

      // Filter entities
      $('#filter li:not(".horizontal-separator")').on("click", function() {
        var type = $(this).attr('class').split(' ')[0];
        self.filterEntities(type);
      });

      // Trigger event with a delay (e.g. to prevent UI blocking)
      // Delay should be called after whole input
      var timer = 0;
      var delay = (function () {
        return function (callback, ms) {
          clearTimeout(timer);
          timer = setTimeout(callback, ms);
        };
      })();

      // Search entities (keyup event also triggered on modifier keys etc.)
      $('#search').off('input').on('input', function (e) {
        delay(function () {
          self.searchEntities();
        }, 500);
      });

      function mouseMoveHandler(e) {
        var initial = e.data.initial,
            left = Math.min(Math.max(initial.leftWidth + e.pageX - initial.position, initial.leftMin),
                   initial.leftWidth + initial.rightWidth - initial.rightMin),
            right = Math.min(Math.max(initial.rightWidth - e.pageX + initial.position, initial.rightMin),
                    initial.leftWidth + initial.rightWidth - initial.leftMin);

        initial.left.width(left);
        initial.right.width(right).css('left', left);
      }

      function mouseUpHandler(e) {
        $(document)
          .unbind('mousemove', mouseMoveHandler)
          .unbind('mouseup', mouseUpHandler);
      }

      // Resize entity list and editor by dragging
      $('#drag-1').bind('mousedown', function (e) {
        e.preventDefault();

        var left = $('#entitylist'),
            right = $('#editor'),
            data = {
              left: left,
              right: right,
              leftWidth: left.outerWidth(),
              rightWidth: right.outerWidth(),
              leftMin: 250,
              rightMin: 350,
              position: e.pageX
            };

        left.css('transition-property', 'none');
        right.css('transition-property', 'none');

        $(document)
          .bind('mousemove', { initial: data }, mouseMoveHandler)
          .bind('mouseup', { initial: data }, mouseUpHandler);
      });

      // Scroll entities
      $('#entitylist .wrapper').scroll(function(e) {
        e.preventDefault();

        var $editableEntities = $('#entitylist .wrapper .editables'),
            $uneditableEntities = $('#entitylist .wrapper .uneditables'),
            entitiesHeight = $editableEntities.height() + $uneditableEntities.height(),
            list = $('#entitylist .wrapper');

        // Prevents from firing multiple calls during onscroll event
        if (entitiesHeight > 0 && (list.scrollTop() >= entitiesHeight * 0.75 - list.height()) && self.hasNext && !self.isLoading()) {
          var currentTop = list.scrollTop();
          self.loadNextEntities();
        }
      });
    },


    /*
     * Is original string pluralized
     */
    isPluralized: function () {
      var original = '',
          nplurals = this.locale.nplurals,
          plural_rule = this.locale.plural_rule,
          pluralForm = this.getPluralForm();

      if ((nplurals < 2 && $('#source-pane').is('.pluralized')) ||
          (nplurals === 2 && pluralForm === 1) ||
          (nplurals > 2 &&
           pluralForm !== -1 &&
           pluralForm !== eval(plural_rule.replace(/n/g, 1)))) {
        original = '_plural';
      }

      return original;
    },


    /*
     * Attach event handlers to editor elements
     */
    attachEditorHandlers: function () {
      var self = this;

      // Top bar
      $("#topbar > a").click(function (e) {
        e.stopPropagation();
        e.preventDefault();

        var sec = $(this).attr('id'),
            entitySelector = '#entitylist .entity:visible',
            index = $('#editor')[0].entity.ui.index(entitySelector);

        switch (sec) {

        case "back":
          self.checkUnsavedChanges(function() {
            self.goBackToEntityList();
            self.stopInPlaceEditing();
          });
          break;

        case "previous":
          var prev = $(entitySelector).eq(index - 1);
          if (prev.length === 0) {
            prev = $(entitySelector + ':last');
          }
          self.switchToEntity(prev[0].entity);
          break;

        case "next":
          var next = $(entitySelector).eq(index + 1);
          if (next.length === 0) {
            next = $(entitySelector + ':first');
          }
          self.switchToEntity(next[0].entity);
          break;

        }
      });

      // Show/hide more source string metadata
      $("#metadata").on("click", "a.details", function (e) {
        e.stopPropagation();
        e.preventDefault();

        var more = $("#metadata .more");
        if ($(this).is(':contains("Less")')) {
          $(this).html('More details');
          more.css('display', 'none');
        } else {
          $(this).html('Less details');
          more.css('display', 'block');
        }
      });

      // Zoom in screenshot
      $('#screenshots').on('click', 'img', function (e) {
        $('body').append('<div id="overlay">' + this.outerHTML + '</div>');
        $('#overlay').fadeIn('fast');
      });

      // Close zoomed screenshot
      $('body').on('click', '#overlay', function() {
        $(this).fadeOut('fast', function() {
          $(this).remove();
        });
      });

      // Insert placeable at cursor, replace selection or at the end if not focused
      $("#original").on("click", ".placeable", function (e) {
        e.stopPropagation();
        e.preventDefault();

        var textarea = $('#translation'),
            selectionStart = textarea.prop('selectionStart'),
            selectionEnd = textarea.prop('selectionEnd'),
            placeable = $(this).text(),
            cursorPos = selectionStart + placeable.length,
            before = textarea.val(),
            after = before.substring(0, selectionStart) + placeable + before.substring(selectionEnd);

        textarea.val(after).focus();
        textarea[0].setSelectionRange(cursorPos, cursorPos);
      });

      function switchToPluralForm(tab) {
        $("#plural-tabs li").removeClass('active');
        tab.addClass('active');

        var entity = $('#editor')[0].entity,
            i = tab.index(),
            original = entity['original' + self.isPluralized()],
            marked = entity['marked' + self.isPluralized()],
            title = !self.isPluralized() ? 'Singular' : 'Plural',
            source = entity.translation[i].string;

        $('#source-pane h2').html(title).show();
        $('#original').html(marked);

        $('#translation').val(source).focus();
        $('#translation-length .original-length').html(original.length);
        self.updateCurrentTranslationLength();
        self.updateCachedTranslation();

        $('#quality:visible .cancel').click();
        self.updateHelpers();
      }

      // Plurals navigation
      $("#plural-tabs a").click(function (e) {
        e.stopPropagation();
        e.preventDefault();

        var tab = $(this).parent();

        // Only if actually clicked on tab
        if (e.hasOwnProperty('originalEvent')) {
          self.checkUnsavedChanges(function() {
            switchToPluralForm(tab);
          });
        } else {
          switchToPluralForm(tab);
        }
      });

      // Translate textarea keyboard shortcuts
      $('#translation').unbind('keydown.pontoon').bind('keydown.pontoon', function (e) {
        var key = e.which;

        // Prevent triggering unnecessary events in 1-column layout
        if (!$("#editor").is('.opened')) {
          return false;
        }

        // Enter: save translation
        if (key === 13 && !e.shiftKey && !e.altKey) {
          if ($('#leave-anyway').is(':visible')) {
            $('#leave-anyway').click();
          } else {
            $('#save').click();
          }
          return false;
        }

        // Esc: cancel translation and return to entity list
        if (key === 27) {
          if ($('.warning-overlay').is(':visible')) {
            $('.warning-overlay .cancel').click();
          } else if (!self.app.advanced) {
            self.checkUnsavedChanges(function() {
              self.goBackToEntityList();
              self.stopInPlaceEditing();
            });
          }
          return false;
        }

        // Ctrl + Alt + C: copy from source
        if (e.ctrlKey && e.altKey && key === 67) {
          $('#copy').click();
          return false;
        }

        // Ctrl + Alt + Backspace: clear translation
        if (e.ctrlKey && e.altKey && key === 8) {
          $('#clear').click();
          return false;
        }

        // Ctrl + Alt + .: go to next string
        if (e.ctrlKey && e.altKey && key === 190) {
          $('#next').click();
          return false;
        }

        // Ctrl + Alt + ,: go to previous string
        if (e.ctrlKey && e.altKey && key === 188) {
          $('#previous').click();
          return false;
        }

        // Tab: select suggestions
        if (!$('.menu').is(':visible') && !$('.popup').is(':visible') && key === 9) {

          var section = $('#helpers section:visible'),
              index = section.find('li.hover').index() + 1;

          // If possible, select next suggestion, or select first
          if (section.find('li:last').is('.hover')) {
            index = 0;
          }

          section
            .find('li').removeClass('hover').end()
            .find('li:eq(' + index + ')').addClass('hover').click();

          self.updateScroll(section);
          return false;
        }

      // Update length (keydown is triggered too early)
      }).unbind("input propertychange").bind("input propertychange", function (e) {
        self.updateCurrentTranslationLength();
        $('.warning-overlay:visible .cancel').click();
      });

      // Close warning box
      $('.warning-overlay .cancel').click(function (e) {
        e.stopPropagation();
        e.preventDefault();

        $('.warning-overlay')
          .find('ul').empty().end()
        .hide();

        $('#translation').focus();
      });

      $('#leave-anyway').click(function() {
        var callback = self.checkUnsavedChangesCallback;
        if (callback) {
          callback();
          $('#unsaved').hide();
          $('#translation').val(self.cachedTranslation);
        }
      });

      // Copy source to translation
      $("#copy").click(function (e) {
        e.stopPropagation();
        e.preventDefault();

        var entity = $('#editor')[0].entity,
            original = entity['original' + self.isPluralized()],
            source = original;

        $('#translation').val(source).focus();
        self.updateCurrentTranslationLength();
        self.updateCachedTranslation();
      });

      // Clear translation area
      $("#clear").click(function (e) {
        e.stopPropagation();
        e.preventDefault();

        $('#translation').val('').focus();
        self.updateCurrentTranslationLength();
        self.updateCachedTranslation();
      });

      // Save translation
      $('#save, #save-anyway').click(function (e) {
        e.stopPropagation();
        e.preventDefault();

        var entity = $('#editor')[0].entity,
            source = $('#translation').val();

        if (source === '' &&
          ['properties', 'ini', 'dtd'].indexOf(entity.format) === -1) {
            self.endLoader('Empty translations cannot be submitted.', 'error');
            return;
        }

        self.updateOnServer(entity, source, false, true);
      });

      // Custom search: trigger with Enter
      $('#helpers .machinery input').unbind('keydown.pontoon').bind('keydown.pontoon', function (e) {
        if (e.which === 13) {
          var source = $(this).val(),
              entity = $('#editor')[0].entity;

          // Reset to original string on empty search
          if (!source) {
            source = entity['original' + self.isPluralized()];
          }

          if (self.machinerySource !== source) {
            self.getMachinery(source);
            self.machinerySource = source;
          }
          return false;
        }
      });

      // Copy helpers result to translation
      $("#helpers section").on("click", "li:not('.disabled')", function (e) {
        e.stopPropagation();
        e.preventDefault();

        var translation = $(this).find('.translation').text(),
            source = translation;
        $('#translation').val(source).focus();
        self.updateCurrentTranslationLength();
        self.updateCachedTranslation();

        $('.warning-overlay:visible .cancel').click();
      });

      // Restore clickable links
      $("#helpers section").on("click", "li a", function (e) {
        e.stopPropagation();
      });

      // Approve and delete translations
      $("#helpers .history").on("click", "menu button", function (e) {
        var button = $(this);
        if (button.is('.approve') && button.parents('li.approved').length > 0) {
          return;
        }

        e.stopPropagation();
        e.preventDefault();

        // Approve
        if (button.is('.approve')) {
          button.parents('li').click();

          var entity = $('#editor')[0].entity,
              translation = $('#translation').val();

          // Mark that user approved translation instead of submitting it
          self.approvedNotSubmitted = true;
          self.updateOnServer(entity, translation, false, true);
          return;
        }

        // Delete
        $.ajax({
          url: '/delete-translation/',
          type: 'POST',
          data: {
            csrfmiddlewaretoken: $('#server').data('csrf'),
            translation: $(this).parents('li').data('id'),
            paths: [history.state.paths],
          },
          success: function(data) {
            var item = button.parents('li'),
                next = item.next(),
                index = item.index(),
                entity = $('#editor')[0].entity,
                pluralForm = self.getPluralForm(true),
                translation = entity.translation[pluralForm];

            self.stats = data.stats;

            item
              .addClass('delete')
              .bind('transitionend', function() {
                $(this).remove();
                self.endLoader('Translation deleted');

                // Active (approved or latest) translation deleted
                if (index === 0) {

                  // Make newest alternative translation active
                  if (next.length) {
                    next.click();
                    var newTranslation = $('#translation').val();

                    if (entity.body && pluralForm === 0) {
                      self.postMessage("SAVE", newTranslation);
                    }

                    self.updateTranslation(translation, {
                      pk: next.data('id'),
                      string: newTranslation,
                      approved: false,
                      fuzzy: false
                    });
                    self.updateEntityUI(entity);

                  // Last translation deleted, no alternative available
                  } else {
                    $('#translation').val('').focus();

                    if (entity.body && pluralForm === 0) {
                      self.postMessage("DELETE");

                    } else {
                      self.updateTranslation(translation, {
                        pk: null,
                        string: null,
                        approved: false,
                        fuzzy: false
                      });
                      self.updateEntityUI(entity);
                    }

                    $('#helpers .history ul')
                      .append('<li class="disabled">' +
                                '<p>No translations available.</p>' +
                              '</li>');
                  }

                  self.updateCurrentTranslationLength();
                  self.updateCachedTranslation();
                }
              });
          },
          error: function() {
            self.endLoader('Oops, something went wrong.', 'error');
          }
        });
      });
    },


    /*
     * Update progress indicator and value
     */
    updateProgress: function () {
      var stats = this.stats,
          total = stats.total,
          translated = stats.translated,
          approved = stats.approved,
          fuzzy = stats.fuzzy,
          untranslated = total - translated - approved - fuzzy,
          fraction = {
            approved: total ? approved / total : 0,
            translated: total ? translated / total : 0,
            fuzzy: total ? fuzzy / total : 0,
            untranslated: total ? untranslated / total : 0
          },
          number = Math.floor(fraction.approved * 100);

      // Update graph
      $('#progress .graph').each(function() {
        var context = this.getContext('2d');
        // Clear old canvas content to avoid aliasing
        context.clearRect(0, 0, this.width, this.height);
        context.lineWidth = this.width/11;

        var x = this.width/2,
            y = this.height/2,
            radius = (this.width - context.lineWidth)/2,
            end = null;

        $('#progress .details > div').each(function(i) {
          var type = $(this).attr('class'),
              length = fraction[type] * 2,
              start = (end !== null) ? end : -0.5;
          end = start + length;

          context.beginPath();
          context.arc(x, y, radius, start * Math.PI, end * Math.PI);
          context.strokeStyle = $(this).css("border-top-color");
          context.stroke();
        });
      });

      // Update number
      $('#progress .number').html(number);

      // Update details in the menu
      $('#progress .menu').find('header span').html(total).end()
        .find('.details')
          .find('.approved p').html(approved).end()
          .find('.translated p').html(translated).end()
          .find('.fuzzy p').html(fuzzy).end()
          .find('.untranslated p').html(untranslated);

      // Update parts menu
      if (total) {
        var parts = $('.project .menu li .name[data-slug=' + this.project.slug + ']')
                      .data('parts')[this.locale.code];

        if (this.entities.length) { // We need this check if no entities found
          path = this.entities[0].path;

          $(parts).each(function() {
            if (this.resource__path === path) {
              this.approved_strings = approved;
            }
          });
        }
      }
    },


    /*
     * Update entity in the entity list
     *
     * entity Entity
     */
    updateEntityUI: function (entity) {
      var self = this,
          status = self.getEntityStatus(entity),
          translation = entity.translation[0].string;

      entity.ui
        .removeClass('translated approved fuzzy')
        .addClass(status)
        .find('.translation-string')
          .html(self.doNotRender(translation || ''));

      self.updateProgress();
    },


    /*
     * Update translation object with provided data
     *
     * translation Translation to update
     * data Data to update translation with
     */
    updateTranslation: function (translation, data) {
      for (var key in data) {
        translation[key] = data[key];
      }
    },


    /*
     * Update all translations in localStorage on server
     */
    syncLocalStorageOnServer: function() {
      if (localStorage.length !== 0) {
        var len = this.entities.length;
        for (var i = 0; i < len; i++) {
          var entity = this.entities[i],
              key = this.getLocalStorageKey(entity),
              value = localStorage[key];
          if (value) {
            value = JSON.parse(localStorage[key]);
            this.updateOnServer(entity, value.translation, false, false);
            delete localStorage[key];
          }
        }

        // Clear all other translations
        localStorage.clear();
      }
    },


    /*
     * Generate localStorage key
     *
     * entity Entity
     */
    getLocalStorageKey: function(entity) {
      return this.locale.code + "/" + entity.pk;
    },


    /*
     * Add entity translation to localStorage
     *
     * entity Entity
     * translation Translation
     */
    addToLocalStorage: function(entity, translation) {
      localStorage.setItem(this.getLocalStorageKey(entity), JSON.stringify({
        translation: translation,
      }));
    },


    /*
     * Show quality check warnings
     *
     * warnings Array of warnings
     */
    showQualityCheckWarnings: function(warnings) {
      $('#quality ul').empty();
      $(warnings).each(function() {
        $('#quality ul').append('<li>' + this + '</li>');
      });
      $('#quality').show();
    },


    /*
     * Update entity translation on server
     *
     * entity Entity
     * translation Translation
     * inplace Was translation submitted in place?
     * syncLocalStorage Synchronize translations in localStorage with the server
     */
    updateOnServer: function (entity, translation, inplace, syncLocalStorage) {
      var self = this,
          pluralForm = self.getPluralForm();

      self.startLoader();

      function renderTranslation(data) {
        self.stats = data.stats;

        if (data.type) {
          if (self.user.email) {
            self.endLoader('Translation ' + data.type);
          } else {
            self.endLoader('Sign in to save translations');
          }

          if (self.approvedNotSubmitted) {
            $('#helpers .history [data-id="' + data.translation.pk + '"] button.approve')
              .parents('li').addClass('approved')
                .siblings().removeClass('approved');
          }

          var pf = self.getPluralForm(true);
          self.cachedTranslation = translation;
          self.updateTranslation(entity.translation[pf], data.translation);
          self.updateEntityUI(entity);

          // Update translation, including in place if possible
          if (!inplace && entity.body && (self.user.isTranslator ||
              !entity.translation[pf].approved)) {
            self.postMessage("SAVE", {
              translation: translation,
              id: entity.id
            });
          }

          // Quit
          if (!$("#editor:visible").is('.opened')) {
            return;

          // Go to next plural form
          } else if (pluralForm !== -1 && $("#editor").is('.opened')) {
            var next = $('#plural-tabs li:visible')
              .eq(pluralForm + 1).find('a');

            if (next.length === 0) {
              $('#next').click();
            } else {
              next.click();
            }

          // Go to next entity
          } else {
            $('#next').click();
          }

        } else if (data.warnings) {
          self.endLoader();
          self.showQualityCheckWarnings(data.warnings);

        } else {
          self.endLoader(data, 'error');
        }

        if (!data.warnings) {
          self.approvedNotSubmitted = null;
        }
      }

      // If the entity has a plural string, but the locale has nplurals == 1,
      // then pluralForm is -1 and needs to be normalized to 0 so that it is
      // stored in the database as a pluralized string.
      // TODO: Get a better flag for pluralized strings than original_plural.
      var submittedPluralForm = pluralForm;
      if (entity.original_plural && submittedPluralForm === -1) {
        submittedPluralForm = 0;
      }

      $.ajax({
        url: '/update/',
        type: 'POST',
        data: {
          csrfmiddlewaretoken: $('#server').data('csrf'),
          locale: self.locale.code,
          entity: entity.pk,
          translation: translation,
          plural_form: submittedPluralForm,
          original: entity['original' + self.isPluralized()],
          ignore_check: inplace || $('#quality').is(':visible') || !syncLocalStorage,
          approve: self.approvedNotSubmitted || false,
          paths: [history.state.paths]
        },
        success: function(data) {
          renderTranslation(data);
          // Connection exists -> sync localStorage
          if (syncLocalStorage) {
            self.syncLocalStorageOnServer();
          }
        },
        error: function(error) {
          if (error.status === 0) {
            // No connection -> use offline mode
            self.addToLocalStorage(entity, translation);
            // Imitate data to add translation
            var data = {
              type: "added",
              translation: {
                approved: self.user.isTranslator,
                fuzzy: false,
                string: translation
              }
            };
            renderTranslation(data);
          } else {
            self.endLoader('Oops, something went wrong.', 'error');
            self.approvedNotSubmitted = null;
          }
        }
      });
    },


    /*
     * Update part selector
     *
     * title Part title
     */
    updatePartSelector: function (title) {
      $('.part .selector')
        .attr('title', title)
        .find('.title')
          // Only show filename instead of full path
          .html(title.replace(/^.*[\\\/]/, ''));
    },


    /*
     * Update download/upload form fields with translation project data
     */
    updateFormFields: function (form) {
      var self = this;

      form
        .find('#id_slug').val(self.project.slug).end()
        .find('#id_code').val(self.locale.code).end()
        .find('#id_part').val(self.part);
    },


    /*
     * Update project and (if needed) part menu
     */
    updateProjectMenu: function () {
      var projects = this.getLocaleData('projects'),
          slug = this.getProjectData('slug');

      // Fallback if selected project not available for the selected locale
      if (projects.indexOf(slug) === -1) {
        slug = projects.sort()[0];
      }

      // Make sure part menu is always updated
      $('.project .menu [data-slug="' + slug + '"]').parent().click();
    },


    /*
     * Update part menu
     */
    updatePartMenu: function () {
      var locale = this.getSelectedLocale(),
          parts = this.getProjectData('parts')[locale],
          currentPart = this.getSelectedPart();
          part = $.grep(parts, function (e) { return e.title === currentPart; });

      // Fallback if selected part not available for the selected locale & project
      if (!part.length) {
        this.updatePartSelector(parts[0].title);
      }
    },


    /*
     * Attach event handlers to main toolbar elements
     */
    attachMainHandlers: function () {
      var self = this;

      // Hide menus on click outside
      $('body').bind("click.main", function (e) {
        $('.menu, #hotkeys').hide();
        $('#iframe-cover').hide(); // iframe fix
        $('.select').removeClass('opened');
        $('.menu li').removeClass('hover');

        // Special case: menu in menu
        if ($(e.target).is('.hotkeys') || $(e.target).parent().is('.hotkeys')) {
          $('#hotkeys').show();
          $('#iframe-cover:not(".hidden")').show(); // iframe fix
        }
      });

      // Open/close sidebar
      $('#switch').unbind("click.pontoon").bind("click.pontoon", function () {
        if ($(this).is('.opened')) {
          $('#sidebar').hide();
          $('#source, #iframe-cover').css('margin-left', 0);
          self.postMessage("MODE", "Advanced");
        } else {
          $('#sidebar').show();
          $('#source, #iframe-cover').css('margin-left', $('#sidebar').width());
          self.postMessage("MODE", "Basic");
        }
        $('#source, #iframe-cover').width($(window).width() - $('#sidebar:visible').width());
        self.postMessage("RESIZE");
        $(this).toggleClass('opened');
      });

      // Locale menu handler
      $('.locale .menu li:not(".no-match")').click(function () {
        var menuItem = $(this),
            locale = menuItem.find('.language').data('code'),
            language = menuItem.find('.language').html();

        $('.locale .selector')
          .find('.language')
            .html(language)
            .data('code', locale)
          .end()
          .find('.code').html(locale);

        if (!self.getLocaleData('projects')) {
          $.ajax({
            url: '/teams/' + locale + '/projects/',
            success: function(projects) {
              menuItem.find('.language').data('projects', projects);
              self.updateProjectMenu();
            }
          });

        } else {
          self.updateProjectMenu();
        }
      });

      // Show only projects available for the selected locale
      $('.project .selector').click(function () {
        self.requestProjects.toggleProjects(true);
      });

      // Project menu handler
      $('.project .menu li:not(".no-match")').click(function (e) {
        var project = $(this).find('.name'),
            name = project.html(),
            slug = project.data('slug'),
            locale = self.getSelectedLocale();

        // Select project
        if (!$('.project .menu .search-wrapper > a').is('.back:visible')) {
          $('.project .selector .title')
            .html(name)
            .data('slug', slug);

          var projectParts = project.data('parts');

          if (projectParts && projectParts[locale]) {
            self.updatePartMenu();

          } else {
            $.ajax({
              url: '/' + locale + '/' + slug + '/parts/',
              success: function(parts) {
                if (projectParts) {
                  projectParts[locale] = parts;
                } else {
                  var obj = {};
                  obj[locale] = parts;
                  project.data('parts', obj);
                }
                self.updatePartMenu();
              }
            });
          }
        }
      });

      // Show only parts available for the selected project
      $('.part .selector').click(function () {
        var locale = self.getSelectedLocale(),
            parts = self.getProjectData('parts')[locale],
            menu = $(this).siblings('.menu').find('ul'),
            project = self.getSelectedProject(),
            currentProject = self.getProjectData('slug') === self.project.slug,
            currentLocale = self.getLocaleData('code') === self.locale.code;

        menu.find('li:not(".no-match")').remove();
        $(parts).each(function(i) {
          var cls = '',
              title = this.title,
              percent = '0%';

          if (currentProject && currentLocale && self.part === title) {
            cls = ' class="current"';
          }

          if (this.resource__total_strings > 0) {
            percent = Math.floor(this.approved_strings / this.resource__total_strings * 100) + '%';
          }

          if (i < parts.length - 1) {
            menu.append('<li' + cls + '>' +
              '<span>' + title + '</span>' +
              '<span>' + percent + '</span>' +
            '</li>');

          } else {
            menu.parents('.menu').find('.static-links .all-resources')
              .find('.percent').html(percent).end()
              .toggleClass('current', self.part === 'All Resources');
          }
        });
      });

      // Parts menu handler
      $('.part .menu').on('click', 'li:not(".no-match"), .static-links .all-resources', function (e) {
        var title = $(this).find('span:first').html();
        self.updatePartSelector(title);
      });

      // Open selected project (part) and locale combination
      $('#go').click(function (e) {
        e.preventDefault();
        e.stopPropagation();

        self.checkUnsavedChanges(function() {
          self.pushState(true);
          self.initializePart(true);
        });

        self.closeNotification();
      });

      // Close notification on click
      $('body > header').on('click', '.notification', function() {
        Pontoon.closeNotification();
      });

      // File upload
      $('#id_uploadfile').change(function() {
        self.updateFormFields($('form#upload-file'));
        $('form#upload-file').submit();
      });
    },


    /*
     * Removes all previously loaded entities and allows to load new ones
     */
    cleanupEntities: function() {
      this.entities = [];
      $('#entitylist .entity').remove();
    },


    /*
     * Hides all previously loaded entities
     */
    hideEntities: function() {
      $('#entitylist .entity').removeClass('limited').hide();
      this.setNotOnPage();
    },


    /*
     * Update save buttons based on user permissions and settings
     */
    updateSaveButtons: function () {
      $('[id^="save"]').toggleClass('suggest', !this.user.isTranslator || this.user.forceSuggestions);
    },


    /*
     * Update profile menu links and contents
     */
    updateProfileMenu: function () {
      $('#profile .admin-current-project a').attr('href', '/admin/projects/' + this.project.slug + '/');
      $('#profile .upload').toggle(history.state.paths && this.user.isTranslator);
    },


    /*
     * Show project info if available
     */
    updateProjectInfo: function () {
      var content = this.project.info;
      $('#info').hide().toggle(content !== "").find('.content').html(content);
    },


    /*
     * Load project details and mark current project & locale
     */
    updateMainMenu: function () {
      $('.project .menu li .name[data-slug=' + this.project.slug + '], ' +
        '.locale .menu li .language[data-code=' + this.locale.code + ']')
        .parent().addClass('current').siblings().removeClass('current');
    },


    /*
     * Reset entity list and editor width
     */
    resetColumnsWidth: function() {
      $('#entitylist, #editor').css('width', '');
    },


    /*
     * Show/hide elements needed for in place localization
     */
    toggleInplaceElements: function() {
      var inplaceElements = $('#source, #iframe-cover, #switch, #drag, #not-on-page, #profile .html').addClass('hidden').hide();

      if (this.project.win) {
        inplaceElements.removeClass('hidden').show();
      }
    },


    /*
     * Create user interface
     */
    createUI: function () {
      // Show message if provided
      if ($('.notification li').length) {
        $('.notification').css('opacity', 100);
      }

      this.setMainLoading(false);
      this.toggleInplaceElements();
      this.resetColumnsWidth();
      this.updateMainMenu();
      this.updateProjectInfo();
      this.updateProfileMenu();
      this.updateSaveButtons();
      this.renderEntityList();

      this.updateProgress();
      $("#progress").show();

      $("#project-load").hide();
      $('#source').click();

      // If 2-column layout opened by default, open first entity in the editor
      if (this.app.advanced) {
        $("#entitylist .entity:first").mouseover().click();

      // If not and editor opened, show entity list
      } else if ($("#editor").is('.opened')) {
        this.goBackToEntityList();
      }
    },


    /*
     * Resize iframe to fit space available
     */
    resizeIframe: function () {
      $('#source')
        .width($(window).width() - $('#sidebar:visible').width())
        .height($(window).height() - $('body > header').outerHeight());
    },


    /*
     * window.postMessage improved
     *
     * messageType data type to be sent to the other window
     * messageValue data value to be sent to the other window
     * otherWindow reference to another window
     * targetOrigin specifies what the origin of otherWindow must be
     */
    postMessage: function (messageType, messageValue, otherWindow, targetOrigin) {
      if (Pontoon.project && !Pontoon.project.win) {
        return false;
      }
      var otherWindow = otherWindow || Pontoon.project.win,
          targetOrigin = targetOrigin || Pontoon.project.url,
          message = {
            type: messageType,
            value: messageValue
          };
      otherWindow.postMessage(JSON.stringify(message), targetOrigin);
    },


    /*
     * Get iframe width given the screen size and requested value
     */
    getProjectWidth: function () {
      var width = this.getProjectData('width') || false;
      if (($(window).width() - width) < 700) {
        width = false;
      }
      return width;
    },


    /*
     * Waits until server returns entitites to frontend.
     */
    waitForEntities: function(mainDeferred, times) {
      var self = this,
          d = mainDeferred || $.Deferred(),
          // How many times should we check entities before displaying an error.
          times = typeof times === 'undefined' ? 10 : times;

      if (times === -1) {
        d.reject();
        return;
      }

      if (Pontoon.entities) {
        d.resolve();
      } else {
        setTimeout(function() {
          self.waitForEntities(d, times - 1);
        }, 100);
      }

      return d;
    },


    /*
     * Handle messages from project code
     */
    receiveMessage: function (e) {
      var projectWindow = $('#source')[0].contentWindow;

      if (e.source === projectWindow) {
        var message = JSON.parse(e.data);

        switch (message.type) {

        case "READY":
          clearInterval(Pontoon.interval);

          var advanced = false,
              websiteWidth = Pontoon.getProjectWidth();

          if (websiteWidth) {
            var windowWidth = $(window).width(),
                sidebarWidth = windowWidth - websiteWidth;

            if (sidebarWidth >= 700) {
              advanced = true;
              $('#sidebar').addClass('advanced').width(sidebarWidth);
              $('#switch, #editor').addClass('opened');

            } else {
              $('#sidebar').show().width(sidebarWidth);
              $('#switch').addClass('opened');
              $('#editor').css('left', sidebarWidth);
            }

          } else if ($('#sidebar:visible').length) {
            $('#sidebar').removeClass('advanced').css('width', '350px').hide();
            $('#switch').removeClass('opened');
          }

          $('#source, #iframe-cover').css('margin-left', $('#sidebar:visible').width() || 0);
          $('#source').show();

          Pontoon.ready = true;
          Pontoon.resizeIframe();
          Pontoon.makeIframeResizable();

          Pontoon.createObject(advanced, $('#source')[0].contentWindow);

          Pontoon.waitForEntities().then(function() {
            Pontoon.postMessage("INITIALIZE", {
              path: Pontoon.app.path,
              links: Pontoon.project.links,
              entities: Pontoon.entities,
              slug: Pontoon.project.slug,
              locale: Pontoon.locale,
              user: Pontoon.user
            }, null, $('#source').attr('src'));
          }, Pontoon.noEntitiesError);
          break;

        case "DATA":
          // Deep copy: http://api.jquery.com/jQuery.extend
          Pontoon.entities = $.extend(
            true,
            Pontoon.entities,
            message.value.entities);
          break;

        case "RENDER":
          var value = message.value;
          Pontoon.project.url = value.url;
          Pontoon.project.title = value.title;
          Pontoon.createUI();
          Pontoon.syncLocalStorageOnServer();
          break;

        case "SWITCH":
          $('#switch').click();
          break;

        case "HOVER":
          Pontoon.entities[message.value].ui.addClass('hovered');
          break;

        case "UNHOVER":
          Pontoon.entities[message.value].ui.removeClass('hovered');
          break;

        case "ACTIVE":
          if ($('#switch').is('.opened')) {
            var entity = Pontoon.entities[message.value.id];
            Pontoon.openEditor(entity, message.value.inplace);
          }
          break;

        case "INACTIVE":
          if (!Pontoon.app.advanced && $("#editor").is('.opened')) {
            Pontoon.goBackToEntityList();
          }
          break;

        case "UPDATE":
          var entity = Pontoon.entities[message.value.id],
              translation = message.value.content;
          Pontoon.updateOnServer(entity, translation, true, true);
          $('#translation').val(translation);
          Pontoon.updateCachedTranslation();
          break;

        case "DELETE":
          var entity = Pontoon.entities[message.value];
          Pontoon.updateEntityUI(entity);
          break;

        }
      }
    },


    /*
     * Make iFrame resizable
     */
    makeIframeResizable: function() {
      function mouseUpHandler(e) {
        $(document)
          .unbind('mousemove', mouseMoveHandler)
          .unbind('mouseup', mouseUpHandler);

        $('#iframe-cover').hide(); // iframe fix
        $('#editor:not(".opened")').css('left', $('#sidebar').width()).show();

        var initial = e.data.initial,
            advanced = Pontoon.app.advanced;
        if (initial.advanced !== advanced) {

          // On switch to 2-column view, populate editor if empty
          if (advanced) {
            if (!$('#editor')[0].entity || !$('#entitylist .entity.hovered').length) {
              $("#entitylist .entity:first").mouseover().click();
            }

          // On switch to 1-column view, open editor if needed
          } else {
            if ($('#entitylist .entity.hovered').length) {
              Pontoon.openEditor($('#editor')[0].entity);
            }
          }
        }
      }

      function mouseMoveHandler(e) {
        var initial = e.data.initial,
            left = Math.min(Math.max(initial.leftWidth + (e.pageX - initial.position), initial.leftMin), initial.leftMax),
            right = Math.min(Math.max(initial.rightWidth - (e.pageX - initial.position), 0), initial.leftMax - initial.leftMin);

        initial.left.width(left);
        initial.right.width(right).css('margin-left', left);

        // Sidebar resized over 2-column breakpoint
        if (left >= 700) {
          $('#entitylist, #editor').removeAttr('style');
          if (!Pontoon.app.advanced) {
            Pontoon.app.advanced = true;
            initial.left.addClass('advanced');
            $('#editor')
              .addClass('opened')
              .show();
          }

        // Sidebar resized below 2-column breakpoint
        } else {
          if (Pontoon.app.advanced) {
            Pontoon.app.advanced = false;
            initial.left.removeClass('advanced').show();
            $('#editor')
              .removeClass('opened')
              .css('left', $('#sidebar').width())
              .hide();
          }
        }

        $('#iframe-cover').width(right).css('margin-left', left); // iframe fix
      }

      // Resize iframe with window
      $(window).resize(function () {
        Pontoon.resizeIframe();
        Pontoon.postMessage("RESIZE");
      });

      // Resize sidebar and iframe
      $('#drag').bind('mousedown', function (e) {
        e.preventDefault();

        var left = $('#sidebar'),
            right = $('#source'),
            data = {
              left: left,
              right: right,
              leftWidth: left.width(),
              rightWidth: right.width(),
              leftMin: 350,
              leftMax: $(window).width(),
              position: e.pageX,
              advanced: Pontoon.app.advanced
            };

        $('#iframe-cover').show().width(right.width()); // iframe fix
        $('#editor:not(".opened")').hide();

        $(document)
          .bind('mousemove', { initial: data }, mouseMoveHandler)
          .bind('mouseup', { initial: data }, mouseUpHandler);
      });
    },


    /*
     * Create Pontoon object data
     *
     * advanced Is advanced (2-column) mode on?
     * projectWindow Website window object
     */
    createObject: function (advanced, projectWindow) {
      var self = this;

      function isTranslator(translatedLocales) {
        if (translatedLocales) {
          return translatedLocales.indexOf(self.locale.code) > -1;
        }
        return false;
      }

      this.app = {
        win: window,
        advanced: advanced,
        path: $('#server').data('site-url') + '/' // pontoon.css injection
      };

      this.project = {
        win: projectWindow,
        url: "",
        title: "",
        slug: self.getProjectData('slug'),
        info: self.getProjectData('info'),
        width: self.getProjectWidth(),
        links: self.getProjectData('links') === 'True' ? true : false
      };

      this.part = this.getSelectedPart();
      this.locale = self.getLocaleData();
      this.user.isTranslator = isTranslator($('#server').data('user-translated-locales'));
    },


    /*
     * Load project with in place translation support
     */
    withInPlace: function() {
      var self = this,
          i = 0;

      self.interval = 0;

      // If no READY received for 10 seconds
      self.interval = setInterval(function() {
        i++;
        if (i > 100 && !self.ready) {
          clearInterval(self.interval);
          window.removeEventListener("message", self.receiveMessage, false);
          return self.withoutInPlace();
        }
      }, 100);

      // In case READY sent before we could catch it
      self.postMessage(
        "ARE YOU READY?",
        null,
        $('#source').prop('contentWindow'),
        $('#source').attr('src')
      );
    },


    /*
     * Load project without in place translation support
     */
    withoutInPlace: function() {
      var self = this;

      $('#sidebar').addClass('advanced').css('width', '100%').show();
      $('#editor').addClass('opened').css('left', '');
      $('#entitylist').css('left', '');

      self.createObject(true);

      $(self.entities).each(function (i) {
        this.id = i;
      });

      self.createUI();
      self.syncLocalStorageOnServer();
    },


    /*
     * Manipulates the loading overlay
     */
    setMainLoading: function(enabled) {
      // Start loader
      if (enabled) {
        $('#project-load').show()
          .find('.text').css('opacity', enabled ? 1 : 0);

        // Show potentially amusing message if loading takes more time
        setTimeout(function() {
          $('#project-load .text').animate({opacity: enabled ? 1:0});
        }, 3000);

      } else {
        $('#project-load').hide();
      }
    },


    /*
     * Tells if current project requires Inplace Editor
     */
    requiresInplaceEditor: function() {
      var part = this.currentPart;
      return part && part.url;
    },


    /*
     * Get paths for the current part
     */
    getCurrentPaths: function() {
      var paths = this.currentPart.resource__path;
      if (paths.constructor === Array) {
        return paths;
      }

      return [paths];
    },


    /*
     * Load entities, store data, prepare UI
     */
    getEntities: function(opts) {
      var self = this,
          state = history.state,
          opts = opts || {},
          params = {
            'project': state.project,
            'locale': state.locale,
            'paths': self.getCurrentPaths(),
            'filterSearch': self.getFilterSearch(),
            'filterType': self.getFilterType(),
            'inplaceEditor': self.requiresInplaceEditor()
          },
          deferred = $.Deferred();

      $.extend(params, opts);

      $.ajax({
        type: 'POST',
        url: '/get-entities/',
        data: params,
        success: function(data) {
          deferred.resolve(data, state, data.has_next);
        },
        error: function(data, text) {
          deferred.reject(text);
        }
      });

      return deferred;
    },


    /*
     * Process entities if returned, considering in place support
     */
    processEntities: function(entitiesData, state, hasNext) {
      var self = this;

      self.stats = entitiesData.stats;
      self.entities = entitiesData.entities;
      self.hasNext = hasNext;

      // No entities found
      if (!self.entities.length) {
        self.setNoMatch(true);
        self.setMainLoading(false);
        self.updateProgress();
        return;

      } else {
        self.setNoMatch(false);
      }

      if (self.requiresInplaceEditor()) {
        self.withInPlace();
      } else {
        self.withoutInPlace();
      }
    },


    /*
     * Displays an error if unable to get entities
     */
    noEntitiesError: function() {
      $('#project-load')
        .find('.animation').hide().end()
        .find('.text')
          .html('Oops, something went wrong.')
          .animate({opacity: 1});
    },


    /*
     * Request entities and website for selected part
     */
    initializePart: function(forceReloadIframe) {
      var self = this;

      self.cleanupEntities();

      // Reset filter and search to default values
      self.setFilter('all');
      $('#search').val('');

      self.ready = null;
      self.setMainLoading(true);
      self.getEntities().then($.proxy(self.processEntities, self), $.proxy(self.noEntitiesError, self));

      if (self.requiresInplaceEditor()) {
        var url = self.currentPart.url;

        if ($('#source').attr('src') !== url || forceReloadIframe) {
          $('#source').attr('src', url);
        }
        window.addEventListener("message", self.receiveMessage, false);
      }
    },


    setSidebarLoading: function(state) {
      $('#entitylist .loading').toggle(state);
    },


    setNoMatch: function(state) {
      $('#entitylist .no-match').toggle(state);
    },


    isLoading: function() {
      return $('#entitylist .loading').css('display') === 'block';
    },


    hasVisibleEntities: function() {
      return $('#entitylist li:visible').length > 0;
    },


    getEntitiesIds: function() {
      return $.map($('#entitylist li'), function(item) {
        return $(item).data('entry-pk');
      });
    },


    loadNextEntities: function() {
      var self = this,
          requiresInplaceEditor = self.requiresInplaceEditor();
          excludeEntities = requiresInplaceEditor ? {} : {excludeEntities: self.getEntitiesIds()};

      self.setSidebarLoading(true);
      self.setNoMatch(false);

      self.getEntities(excludeEntities).then(function(entitiesData, state, hasNext) {
        self.entities = self.entities.concat(entitiesData.entities);
        self.hasNext = hasNext;

        if (requiresInplaceEditor) {
          $(entitiesData.entities).each(function (idx, entity) {
            self.showEntityInSidebar(entity);
          });
          self.setNotOnPage();

        } else {
          $(entitiesData.entities).map($.proxy(self.renderEntity, self)).each(function (idx, entity) {
            self.appendEntityToSidebar(entity);
          });
        }

        if(!hasNext && !self.hasVisibleEntities()) {
          self.setNoMatch(true);
        }
      }).always(function() {
        self.setSidebarLoading(false);
      });
    },


    /*
     * Get currently selected locale code
     */
    getSelectedLocale: function() {
      return $('.locale .selector .language').data('code');
    },


    /*
     * Get currently selected project slug
     */
    getSelectedProject: function() {
      return $('.project .button .title').data('slug');
    },


    /*
     * Get currently selected part name
     */
    getSelectedPart: function() {
      return $('.part .selector').attr('title');
    },


    /*
     * Get data-* attribute value of the currently selected locale
     */
    getLocaleData: function(attribute) {
      var code = this.getSelectedLocale();
      return $('.locale .menu li .language[data-code=' + code + ']').data(attribute);
    },


    /*
     * Get data-* attribute value of the currently selected project
     */
    getProjectData: function(attribute) {
      var slug = this.getSelectedProject();
      return $('.project .menu li .name[data-slug=' + slug + ']').data(attribute);
    },


    /*
     * Update currently selected part object
     */
    updateCurrentPart: function() {
      var locale = this.getSelectedLocale(),
          part = this.getSelectedPart(),
          availableParts = this.getProjectData('parts')[locale],
          matchingParts = $.grep(availableParts, function (e) {
            return e.title === part;
          });

      if (!matchingParts.length) {
        this.currentPart = availableParts[0];
      } else {
        this.currentPart = matchingParts[0];
      }
    },


    /*
     * Push history state
     */
    pushState: function() {
      var project = this.getSelectedProject(),
          locale = this.getSelectedLocale(),
          paths = requestedPart = this.getSelectedPart();

      // Fallback to first available part if no matches found (mistyped URL)
      this.updateCurrentPart();
      paths = this.currentPart.title;
      this.updatePartSelector(paths);

      var state = {
        project: project,
        locale: locale,
        paths: paths
      },
      url = '/' + locale + '/' + project + '/' + paths + '/';

      // Keep homepage URL
      if (window.location.pathname === '/' && project === 'pontoon-intro') {
        url = '/';
      }

      history.pushState(state, '', url);
    }

  });
}(Pontoon || {}));

/* Main code */
window.onpopstate = function(e) {
  if (e.state) {
    // Update main menu
    $('.project .menu li [data-slug="' + e.state.project + '"]').parent().click();
    $('.locale .menu li .language[data-code="' + e.state.locale + '"]').parent().click();

    if (e.state.paths) {
      // Also update part, otherwise the first one gets selected
      Pontoon.updateCurrentPart();
      Pontoon.updatePartSelector(e.state.paths);
    }

    Pontoon.initializePart(true);
  }
};

Pontoon.user = {
  email: $('#server').data('email') || '',
  name: $('#server').data('name') || '',
  forceSuggestions: $('#server').data('force-suggestions') === 'True' ? true : false,
  manager: $('#server').data('manager')
};

Pontoon.attachMainHandlers();
Pontoon.attachEntityListHandlers();
Pontoon.attachEditorHandlers();
Pontoon.pushState(true);
Pontoon.initializePart();
