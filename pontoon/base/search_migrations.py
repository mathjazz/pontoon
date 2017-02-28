"""
Django doesn't support migrations for fulltext fields,
django-pg-fts isn't actively maintained and current codebase is broken between various versions of Django.

Because of that I decided to implement our migrations with intent to drop it when django develops its own solution.
"""

from django.db.migrations.operations.base import Operation


class BaseSearchOperation(Operation):
    """
    Currently Search operations don't change state of model.
    """
    def state_forwards(self, app_label, state):
        pass


class CreateGINIndex(BaseSearchOperation):
    """
    Create a GIN index.
    """

    create_sql = """
        CREATE INDEX {model}_{index_field} ON \"{model}\"
        USING GIN({index_field})
    """

    drop_sql = """
        DROP INDEX {model}_{index_field}
    """

    def __init__(self, model, index_field):
        """
        :param model: name of model
        :param index_field: name of model's field
        """
        self.index_field = index_field
        self.model = model

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        schema_editor.execute(
            self.create_sql.format(
                model=self.model,
                index_field=self.index_field
            )
        )

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        schema_editor.execute(
            self.drop_sql.format(
                model=self.model,
                index_field=self.index_field
            )
        )


class UpdateSearchIndex(BaseSearchOperation):
    """
    Create a trigger to update index field when model is changed.
    Every index field can be created from multiple fields that are available in the same model.
    """

    create_sql = """
        CREATE FUNCTION {model}_{index_field}_update() RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                new.{index_field} = {vectors};
            END IF;
            IF TG_OP = 'UPDATE' THEN
                new.{index_field} = {vectors};
            END IF;
        RETURN NEW;
        END;
        $$ LANGUAGE 'plpgsql';
        CREATE TRIGGER {model}_{index_field}_update BEFORE INSERT OR UPDATE ON \"{model}\"
        FOR EACH ROW EXECUTE PROCEDURE {model}_{index_field}_update()
    """
    drop_sql = """
        DROP TRIGGER {model}_{index_field}_update ON \"{model}\";
        DROP FUNCTION {model}_{index_field}_update()
    """

    def __init__(self, model, index_field, from_fields, dictionary='simple'):
        """
        :param model: name of model
        :param index_field: name of field that will store index informations.
        :param from_fields: bind contents of index field from those fields.
        :param dictionary: name of postgresql dictionary.
        """
        self.dictionary = dictionary
        self.model = model
        self.index_field = index_field
        self.from_fields = from_fields

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        def get_if_changed_sql(field):
            return "NEW.{field} <> OLD.{field}".format(field=field)

        def get_vector_sql(field):
            return "to_tsvector('{dictionary}', COALESCE(NEW.{field}, ''))".format(
                dictionary=self.dictionary,
                field=field,
            )

        fts_fields = ' OR '.join(map(get_if_changed_sql, self.from_fields + ['search_index']))
        vectors = ' || '.join(map(get_vector_sql, self.from_fields))

        schema_editor.execute(
            self.create_sql.format(
                model=self.model,
                index_field=self.index_field,
                fts_fields=fts_fields,
                vectors=vectors,
            )
        )

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        schema_editor.execute(
            self.drop_sql.format(
                model=self.model,
                index_field=self.index_field
            )
        )
