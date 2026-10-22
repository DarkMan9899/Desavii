ALTER TABLE category_attributes
  DROP CHECK chk_category_attributes_depends_on_pair,
  DROP FOREIGN KEY fk_category_attributes_depends_on_option,
  DROP FOREIGN KEY fk_category_attributes_depends_on_definition;
ALTER TABLE category_attributes
  DROP INDEX fk_category_attributes_depends_on_option,
  DROP INDEX fk_category_attributes_depends_on_definition,
  DROP COLUMN depends_on_attribute_option_id,
  DROP COLUMN depends_on_attribute_definition_id;
