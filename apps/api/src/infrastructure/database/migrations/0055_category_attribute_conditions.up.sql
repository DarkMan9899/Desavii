-- Partner Listing Wizard rebuild — conditional attributes. Some facts only
-- mean something after another choice: a car's daily distance limit only
-- when its mileage policy is LIMITED, a tour's pickup details only when it
-- offers hotel pickup. The condition is data on the category's own
-- attribute link (the same row that already says whether the attribute is
-- required for the category), so the Wizard, the API's validation and
-- publish readiness all read one rule instead of each hardcoding it.
--
-- Both columns are nullable — an unconditional attribute (every existing
-- row) keeps NULL in both, so no existing data changes. The pair is set
-- together or not at all; the option must belong to the controlling
-- attribute, which the seed guarantees (an option row is looked up through
-- its own attribute).
ALTER TABLE category_attributes
  ADD COLUMN depends_on_attribute_definition_id BIGINT UNSIGNED NULL AFTER sort_order,
  ADD COLUMN depends_on_attribute_option_id BIGINT UNSIGNED NULL AFTER depends_on_attribute_definition_id,
  ADD CONSTRAINT fk_category_attributes_depends_on_definition
    FOREIGN KEY (depends_on_attribute_definition_id) REFERENCES attribute_definitions (id),
  ADD CONSTRAINT fk_category_attributes_depends_on_option
    FOREIGN KEY (depends_on_attribute_option_id) REFERENCES attribute_options (id),
  ADD CONSTRAINT chk_category_attributes_depends_on_pair CHECK (
    (depends_on_attribute_definition_id IS NULL AND depends_on_attribute_option_id IS NULL)
    OR (depends_on_attribute_definition_id IS NOT NULL AND depends_on_attribute_option_id IS NOT NULL)
  );
