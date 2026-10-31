// Small pieces shared by the staff area files: status tags, role names and text tidying.
import React from 'react';

export const STAFF = ['admin', 'sales', 'editor', 'moderator'];
export const ROLE_LABEL = { admin: 'Administrator', sales: 'Sales', moderator: 'Sales', editor: 'Editor', user: 'Customer' };
export const T = ({ c, children }) => <span className={'tag ' + c}>{children}</span>;
export const stTag = { pending: 'tag-warn', live: 'tag-ok', rejected: 'tag-bad', swapped: 'tag-grey', withdrawn: 'tag-grey', available: 'tag-ok', sold: 'tag-grey', hidden: 'tag-bad', new: 'tag-warn', contacted: 'tag-info', closed: 'tag-grey', accepted: 'tag-ok', inspection: 'tag-warn', completed: 'tag-ok', declined: 'tag-bad', cancelled: 'tag-grey', due: 'tag-bad', paid: 'tag-ok', none: 'tag-grey', published: 'tag-ok', draft: 'tag-grey' };

// Finds cars by title, stock number or VIN (full VIN or any part of it, e.g. the last 6 characters)
export const norm = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
