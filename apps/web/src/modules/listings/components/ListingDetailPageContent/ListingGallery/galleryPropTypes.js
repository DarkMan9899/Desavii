/** The `toGalleryItems` item shape, shared by the gallery's parts. */

import PropTypes from 'prop-types';

export const galleryItemShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  type: PropTypes.oneOf(['IMAGE', 'VIDEO']).isRequired,
  url: PropTypes.string.isRequired,
  thumbnailUrl: PropTypes.string.isRequired,
  alt: PropTypes.string.isRequired,
  caption: PropTypes.string,
});

export default galleryItemShape;
