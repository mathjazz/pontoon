/* @flow */

import * as React from 'react';
import ReactTimeAgo from 'react-time-ago';
import { Localized } from '@fluent/react';

import './TranslationComments.css';

import { CommentsList } from 'core/comments';
import { TranslationProxy } from 'core/translation';
import { UserAvatar } from 'core/user';

import type { Entity } from 'core/api';
import type { Locale } from 'core/locale';
import type { UserState } from 'core/user';
import type { HistoryTranslation } from 'modules/history';


type Props = {|
    addComment: (string, ?number) => void,
    closeTranslationComments: () => void,
    entity: Entity,
    locale: Locale,
    translation: HistoryTranslation,
    user: UserState,
|};


export default function TranslationComments(props: Props) {
    const { addComment, entity, locale, translation, user, closeTranslationComments } = props;

    const comments = translation.comments;

    /* TODO: Make it a component and reuse in Translation.js */
    function renderUser() {
        if (!translation.uid) {
            return <span>{ translation.user }</span>;
        }

        return <a
            href={ `/contributors/${translation.username}` }
            target='_blank'
            rel='noopener noreferrer'
            onClick={ (e: SyntheticMouseEvent<>) => e.stopPropagation() }
        >
            { translation.user }
        </a>
    }

    return <section className='translation-comments'>
        <div className='heading'>
            <Localized
                id='translationcomments-TranslationComments--title'
                stress={
                    <span className="stress" />
                }
                $commentCount={ comments.length }
            >
                <span className='title'>
                    { '<stress>{ $commentCount }</stress> Translation Comments' }
                </span>
            </Localized>
            <Localized
                id='translationcomments-TranslationComments--close'
                attrs={{ ariaLabel: true }}
            >
                <button
                    aria-label='Close translation comments popup'
                    className='close'
                    onClick={ closeTranslationComments }
                >
                    ×
                </button>
            </Localized>
        </div>

        <div className='scrollable'>
            <div className='translation'>
                <UserAvatar
                    username={ translation.username }
                    imageUrl={ translation.userGravatarUrlSmall }
                />
                <div className='content'>
                    <header className='clearfix'>
                        <div className='info'>
                            { renderUser() }
                            <ReactTimeAgo
                                dir='ltr'
                                date={ new Date(translation.dateIso) }
                                title={ `${translation.date} UTC` }
                            />
                        </div>
                    </header>
                    <p
                        className='default'
                        dir={ locale.direction }
                        lang={ locale.code }
                        data-script={ locale.script }
                    >
                        <TranslationProxy
                            content={ translation.string }
                            format={ entity.format }
                        />
                    </p>
                </div>
            </div>

            <CommentsList
                comments={ comments }
                translation={ translation }
                user={ user }
                canComment={ user.isAuthenticated }
                addComment={ addComment }
            />
        </div>;
    </section>;
}
